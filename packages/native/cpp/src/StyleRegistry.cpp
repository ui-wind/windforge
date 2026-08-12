#include <windforge/fabric/StyleRegistry.h>

#include <unordered_set>

namespace windforge::fabric {

namespace {

/** Depth-first collection of the family of every node under `node`. */
void collectFamilies(
    facebook::react::ShadowNode const& node,
    std::unordered_set<StyleRegistry::FamilyShared>& out) {
  out.insert(node.getFamilyShared());
  for (auto const& child : node.getChildren()) {
    collectFamilies(*child, out);
  }
}

} // namespace

void StyleRegistry::updateStyle(std::string className, folly::dynamic props) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto& style = styles_[className];
  if (!style) {
    style = std::make_shared<ResolvedStyle>();
  }
  style->props = std::move(props);
  style->generation += 1; // Pending bindings re-apply on the next commit.
}

void StyleRegistry::link(FamilyShared family, std::string className) {
  std::lock_guard<std::mutex> lock(mutex_);
  bindings_[std::move(family)] = Binding{std::move(className), 0, false};
}

void StyleRegistry::suspend(FamilyShared const& family) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (auto it = bindings_.find(family); it != bindings_.end()) {
    it->second.suspended = true;
  }
}

void StyleRegistry::unlink(FamilyShared const& family) {
  std::lock_guard<std::mutex> lock(mutex_);
  bindings_.erase(family);
}

void StyleRegistry::pruneUnmountedEntries(
    facebook::react::RootShadowNode const& root) {
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

std::vector<StyleRegistry::PendingBinding> StyleRegistry::collectPending(
    facebook::react::SurfaceId surface) const {
  // Called with mutex_ held (see withLock).
  std::vector<PendingBinding> pending;
  for (auto const& [family, binding] : bindings_) {
    if (binding.suspended || family->getSurfaceId() != surface) {
      continue;
    }
    if (auto styleIt = styles_.find(binding.className);
        styleIt != styles_.end()) {
      auto const& style = styleIt->second;
      if (style->generation != binding.appliedGeneration) {
        pending.push_back(PendingBinding{family, style});
      }
    }
  }
  return pending;
}

void StyleRegistry::markApplied(std::vector<PendingBinding> const& applied) {
  // Called with mutex_ held (see withLock).
  for (auto const& entry : applied) {
    if (auto it = bindings_.find(entry.family); it != bindings_.end()) {
      it->second.appliedGeneration = entry.style->generation;
    }
  }
}

std::vector<facebook::react::Tag> StyleRegistry::collectLiveTags(
    std::unordered_set<std::string> const& classes) const {
  std::lock_guard<std::mutex> lock(mutex_);
  std::vector<facebook::react::Tag> tags;
  for (auto const& [family, binding] : bindings_) {
    if (binding.suspended || !classes.contains(binding.className)) {
      continue;
    }
    // A binding can only exist for a registered className, so the style is
    // present; a binding with no style registered yet never happens through
    // the protocol (registerStyles runs before link).
    tags.push_back(family->getTag());
  }
  return tags;
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
