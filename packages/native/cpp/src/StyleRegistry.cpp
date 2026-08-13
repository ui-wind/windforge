#include <windforge/fabric/StyleRegistry.h>

#include <memory>
#include <unordered_map>
#include <unordered_set>

#include <folly/json.h>
#include <react/renderer/core/ComponentDescriptor.h>
#include <react/renderer/core/PropsParserContext.h>
#include <react/renderer/core/RawProps.h>
#include <react/renderer/core/ShadowNodeFragment.h>

namespace windforge::fabric {

namespace react = facebook::react;

namespace {

/** Depth-first collection of the family of every node under `node`. */
void collectFamilies(
    react::ShadowNode const& node,
    std::unordered_set<StyleRegistry::FamilyShared>& out) {
  out.insert(node.getFamilyShared());
  for (auto const& child : node.getChildren()) {
    collectFamilies(*child, out);
  }
}

/**
 * Depth-first family → node map, restricted to `wanted` families. Walks
 * shared pointers (children are stored as shared_ptr<const ShadowNode>) so
 * the map holds the exact immutable objects React installed — identity
 * comparison later is exact.
 */
void collectNodes(
    StyleRegistry::NodeShared const& node,
    std::unordered_set<StyleRegistry::FamilyShared> const& wanted,
    std::unordered_map<
        StyleRegistry::FamilyShared,
        StyleRegistry::NodeShared>& out) {
  auto family = node->getFamilyShared();
  if (wanted.contains(family)) {
    out.emplace(family, node);
  }
  for (auto const& child : node->getChildren()) {
    collectNodes(child, wanted, out);
  }
}

} // namespace

void StyleRegistry::updateStyle(std::string className, folly::dynamic props) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = styles_.find(className);
  if (it == styles_.end()) {
    auto style = std::make_shared<ResolvedStyle>();
    style->props = std::move(props);
    style->generation = 1;
    styles_.emplace(std::move(className), std::move(style));
    return;
  }
  // Copy-on-write: replace with a fresh ResolvedStyle instead of mutating
  // the existing one. Pending snapshots handed to commit paths keep their
  // generation-accurate copy untouched (StyleRegistry::snapshotPending).
  auto next = std::make_shared<ResolvedStyle>(*it->second);
  next->props = std::move(props);
  next->generation += 1; // Pending bindings re-apply on the next commit.
  it->second = std::move(next);
  // The queued generation has not landed yet: appliedNode must describe the
  // tree's current (pre-merge) contents, not a stale merge of the previous
  // generation — otherwise regression detection in mergePendingIntoRoot
  // would compare against the wrong node after the pending merge lands.
  for (auto& [family, binding] : bindings_) {
    if (binding.className == className) {
      binding.appliedNode.reset();
    }
  }
}

void StyleRegistry::link(FamilyShared family, std::string className) {
  std::lock_guard<std::mutex> lock(mutex_);
  bindings_[std::move(family)] = Binding{std::move(className), 0, false};
}

void StyleRegistry::suspend(FamilyShared const& family) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (auto it = bindings_.find(family); it != bindings_.end()) {
    it->second.suspended = true;
    // A suspended binding is skipped by the merge; keeping the node would
    // make the first commit after resume re-merge purely on a mismatch.
    it->second.appliedNode.reset();
  }
}

void StyleRegistry::unlink(FamilyShared const& family) {
  std::lock_guard<std::mutex> lock(mutex_);
  bindings_.erase(family);
}

void StyleRegistry::pruneUnmountedEntries(
    react::RootShadowNode const& root) {
  // Called with mutex_ held (see withLock). The committed tree is the
  // source of truth for liveness — unmount callbacks can be missed.
  std::unordered_set<FamilyShared> mounted;
  collectFamilies(root, mounted);
  for (auto it = bindings_.begin(); it != bindings_.end();) {
    if (mounted.contains(it->first)) {
      ++it;
    } else {
      it = bindings_.erase(it);
    }
  }
}

std::vector<StyleRegistry::PendingSnapshot> StyleRegistry::snapshotPending(
    react::SurfaceId surface) {
  std::lock_guard<std::mutex> lock(mutex_);
  std::vector<PendingSnapshot> snapshots;
  for (auto const& [family, binding] : bindings_) {
    if (binding.suspended || family->getSurfaceId() != surface) {
      continue;
    }
    if (auto styleIt = styles_.find(binding.className);
        styleIt != styles_.end()) {
      auto const& style = styleIt->second;
      if (style->generation != binding.appliedGeneration) {
        snapshots.push_back(PendingSnapshot{
            family,
            binding.className,
            style->generation,
            style->props, // Copy — JS may push a newer resolution while
                          // the snapshot is being committed lock-free.
        });
      }
    }
  }
  return snapshots;
}

void StyleRegistry::markApplied(
    react::SurfaceId surface,
    std::vector<AppliedEntry> const& applied) {
  std::lock_guard<std::mutex> lock(mutex_);
  for (auto const& entry : applied) {
    auto bindingIt = bindings_.find(entry.family);
    if (bindingIt == bindings_.end()) {
      continue; // Unlinked since the snapshot — nothing to record.
    }
    auto& binding = bindingIt->second;
    if (binding.className != entry.className ||
        binding.suspended ||
        entry.family->getSurfaceId() != surface) {
      continue; // Re-linked or suspended since the snapshot.
    }
    // The tree now carries this clone: regression detection compares
    // against it even while a newer generation is still queued.
    binding.appliedNode = entry.node;
    auto styleIt = styles_.find(entry.className);
    if (styleIt == styles_.end()) {
      continue;
    }
    if (styleIt->second->generation == entry.generation) {
      binding.appliedGeneration = entry.generation;
    }
    // A newer generation arrived while the snapshot was in flight: keep the
    // binding pending so the next commit applies the newer value.
  }
}

react::RootShadowNode::Unshared StyleRegistry::mergePendingIntoRoot(
    react::SurfaceId surface,
    react::RootShadowNode::Unshared const& root) {
  // Called with mutex_ held (see withLock).
  pruneUnmountedEntries(*root);

  // Collect what needs (re)merging: generation-pending bindings, plus the
  // regression case — React re-committing a ShadowNode that predates the
  // merge. Generation bookkeeping alone cannot see that (appliedGeneration
  // already equals the current one), but node identity can: the bound
  // family's node in the incoming tree must be the exact clone the previous
  // merge produced, else the merged style is gone and must be re-applied.
  //
  // Resolve each live binding's current node in `root` first so the
  // regression comparison has something to compare against.
  std::unordered_map<FamilyShared, NodeShared> currentNode;
  {
    std::unordered_set<FamilyShared> wanted;
    for (auto const& [family, binding] : bindings_) {
      if (!binding.suspended && family->getSurfaceId() == surface &&
          styles_.count(binding.className) > 0) {
        wanted.insert(family);
      }
    }
    collectNodes(root, wanted, currentNode);
  }

  std::unordered_map<react::ShadowNodeFamily const*, PendingSnapshot> pending;
  for (auto const& [family, binding] : bindings_) {
    if (binding.suspended || family->getSurfaceId() != surface) {
      continue;
    }
    auto styleIt = styles_.find(binding.className);
    if (styleIt == styles_.end()) {
      continue;
    }
    auto const& style = styleIt->second;
    if (style->generation != binding.appliedGeneration) {
      pending.emplace(
          family.get(),
          PendingSnapshot{family, binding.className, style->generation, style->props});
      continue;
    }
    // Regression: style is up to date, but the node the tree currently
    // carries is not the clone we merged into — React resurrected a
    // pre-merge node. Re-merge to restore the style.
    auto nodeIt = currentNode.find(family);
    if (nodeIt != currentNode.end() && binding.appliedNode != nullptr &&
        nodeIt->second != binding.appliedNode) {
      pending.emplace(
          family.get(),
          PendingSnapshot{family, binding.className, style->generation, style->props});
    }
  }
  if (pending.empty()) {
    return root;
  }

  std::vector<PendingSnapshot> snapshots;
  snapshots.reserve(pending.size());
  for (auto const& [family, snapshot] : pending) {
    snapshots.push_back(snapshot);
  }

  auto [merged, applied] = mergeSnapshotsIntoRoot(*root, snapshots);
  if (applied.empty()) {
    // Every pending family is being unmounted in this very commit; prune
    // already ran, so the next commit has nothing pending.
    return root;
  }
  // Safe to update directly: the caller holds the lock (withLock contract).
  for (auto const& entry : applied) {
    if (auto it = bindings_.find(entry.family); it != bindings_.end()) {
      it->second.appliedNode = entry.node;
      if (auto styleIt = styles_.find(entry.className);
          styleIt != styles_.end() &&
          styleIt->second->generation == entry.generation) {
        it->second.appliedGeneration = entry.generation;
      }
    }
  }
  return std::move(merged);
}

MergeResult mergeSnapshotsIntoRoot(
    react::RootShadowNode const& root,
    std::vector<StyleRegistry::PendingSnapshot> const& snapshots) {
  // cloneMultiple matches targets by TAG (walking each family's ancestor
  // chain), so a stale snapshot could drag a live node with a colliding tag
  // into the callback. Guard the callback by family identity and pass
  // everything else through untouched.
  std::unordered_set<std::shared_ptr<const react::ShadowNodeFamily>> families;
  std::unordered_map<
      react::ShadowNodeFamily const*,
      StyleRegistry::PendingSnapshot const*>
      bySnapshot;
  families.reserve(snapshots.size());
  bySnapshot.reserve(snapshots.size());
  for (auto const& entry : snapshots) {
    families.insert(entry.family);
    bySnapshot.emplace(entry.family.get(), &entry);
  }

  std::vector<StyleRegistry::AppliedEntry> applied;
  applied.reserve(snapshots.size());

  auto cloned = root.cloneMultiple(
      families,
      [&](react::ShadowNode const& node,
          react::ShadowNodeFragment const& fragment)
          -> std::shared_ptr<react::ShadowNode> {
        auto found = bySnapshot.find(&node.getFamily());
        if (found == bySnapshot.end()) {
          // Tag collision or an ancestor on the rebuild path — keep the
          // node as-is (with any rebuilt children).
          return node.clone(fragment);
        }

        auto const& snapshot = *found->second;
        // snapshot.props must carry values in the same format React's prop
        // pipeline produces (colors as processed integer colors, not CSS
        // strings): cloneProps parses raw props with the C++ parser, which
        // has no string-color support. The JS side converts at the native
        // boundary (toNativeStyle).
        react::PropsParserContext propsContext{
            node.getSurfaceId(), *node.getContextContainer()};
        auto mergedProps = node.getComponentDescriptor().cloneProps(
            propsContext,
            node.getProps(),
            react::RawProps(snapshot.props));
        auto mergedNode = node.clone({
            .props = mergedProps,
            .children = fragment.children,
            .state = node.getState(),
            .runtimeShadowNodeReference = true,
        });
        applied.push_back(
            {snapshot.family, snapshot.className, snapshot.generation, mergedNode});
        return mergedNode;
      });

  if (cloned == nullptr) {
    return {nullptr, {}};
  }
  return {
      std::static_pointer_cast<react::RootShadowNode>(std::move(cloned)),
      std::move(applied),
  };
}

std::size_t StyleRegistry::bindingCount() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return bindings_.size();
}

std::size_t StyleRegistry::styleCount() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return styles_.size();
}

} // namespace windforge::fabric
