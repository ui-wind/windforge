#include <windforge/fabric/StyleCommitHook.h>

#include <memory>
#include <unordered_map>
#include <unordered_set>

#include <react/renderer/core/PropsParserContext.h>
#include <react/renderer/core/RawProps.h>
#include <react/renderer/core/ShadowNodeFragment.h>
#include <react/renderer/mounting/ShadowTree.h>

namespace windforge::fabric {

namespace react = facebook::react;

StyleCommitHook::StyleCommitHook(
    react::UIManager& uiManager,
    StyleRegistry& registry)
    : uiManager_(uiManager), registry_(registry) {
  uiManager_.registerCommitHook(*this);
}

StyleCommitHook::~StyleCommitHook() {
  uiManager_.unregisterCommitHook(*this);
}

void StyleCommitHook::commitHookWasRegistered(
    react::UIManager const&) noexcept {}

void StyleCommitHook::commitHookWasUnregistered(
    react::UIManager const&) noexcept {}

react::RootShadowNode::Unshared StyleCommitHook::shadowTreeWillCommit(
    react::ShadowTree const& shadowTree,
    react::RootShadowNode::Shared const& oldRootShadowNode,
    react::RootShadowNode::Unshared const& newRootShadowNode,
    react::ShadowTreeCommitOptions const& options) noexcept {
  (void)oldRootShadowNode;
  commitsObserved_.fetch_add(1, std::memory_order_relaxed);

  // Only ride on React-initiated commits. AnimationEndSync commits come
  // from the animation backend itself; mutating those would risk feeding
  // changes back into its own sync pass. Commits issued by
  // UIManager::updateShadowTree (our own push path) are already merged —
  // re-processing them would double-count mutations.
  if (options.source != react::ShadowTreeCommitSource::React &&
      options.source != react::ShadowTreeCommitSource::ReactRevisionMerge) {
    return newRootShadowNode;
  }

  try {
    return mergePendingStyles(shadowTree, newRootShadowNode);
  } catch (...) {
    // Never let an exception cross the noexcept boundary into the render
    // pipeline. Pending bindings were not marked applied, so the next
    // commit retries the merge.
    return newRootShadowNode;
  }
}

react::RootShadowNode::Unshared StyleCommitHook::mergePendingStyles(
    react::ShadowTree const& shadowTree,
    react::RootShadowNode::Unshared const& newRootShadowNode) {
  return registry_.withLock(
      [&](StyleRegistry& registry) -> react::RootShadowNode::Unshared {
        // The committed tree is the source of truth for liveness: drop
        // bindings for families React already unmounted.
        registry.pruneUnmountedEntries(*newRootShadowNode);

        auto pending = registry.collectPending(shadowTree.getSurfaceId());
        if (pending.empty()) {
          return newRootShadowNode;
        }

        // cloneMultiple matches targets by TAG (walking each family's
        // ancestor chain), so a stale binding could drag a live node with a
        // colliding tag into the callback. Guard the callback by family
        // identity and pass everything else through untouched.
        std::unordered_set<std::shared_ptr<const react::ShadowNodeFamily>>
            families;
        std::unordered_map<
            react::ShadowNodeFamily const*,
            StyleRegistry::PendingBinding const*>
            byFamily;
        families.reserve(pending.size());
        byFamily.reserve(pending.size());
        for (auto const& entry : pending) {
          families.insert(entry.family);
          byFamily.emplace(entry.family.get(), &entry);
        }

        auto cloned = newRootShadowNode->cloneMultiple(
            families,
            [&](react::ShadowNode const& node,
                react::ShadowNodeFragment const& fragment)
                -> std::shared_ptr<react::ShadowNode> {
              auto found = byFamily.find(&node.getFamily());
              if (found == byFamily.end()) {
                // Tag collision or an ancestor on the rebuild path — keep
                // the node as-is (with any rebuilt children).
                return node.clone(fragment);
              }

              auto const& binding = *found->second;
              // binding.style->props must carry values in the same format
              // React's prop pipeline produces (colors as processed integer
              // colors, not CSS strings): cloneProps parses raw props with
              // the C++ parser, which has no string-color support. The JS
              // side converts at the native boundary (toNativeStyle).
              react::PropsParserContext propsContext{
                  node.getSurfaceId(), *node.getContextContainer()};
              auto mergedProps = node.getComponentDescriptor().cloneProps(
                  propsContext,
                  node.getProps(),
                  react::RawProps(binding.style->props));
              return node.clone({
                  .props = mergedProps,
                  .children = fragment.children,
                  .state = node.getState(),
                  .runtimeShadowNodeReference = true,
              });
            });

        if (cloned == nullptr) {
          // None of the pending families exist under the new root (they
          // are being unmounted in this very commit); prune already ran,
          // the next commit has nothing pending.
          return newRootShadowNode;
        }

        registry.markApplied(pending);
        commitsMutated_.fetch_add(1, std::memory_order_relaxed);
        return std::static_pointer_cast<react::RootShadowNode>(cloned);
      });
}

uint64_t StyleCommitHook::commitsObserved() const {
  return commitsObserved_.load(std::memory_order_relaxed);
}

uint64_t StyleCommitHook::commitsMutated() const {
  return commitsMutated_.load(std::memory_order_relaxed);
}

} // namespace windforge::fabric
