#include <windforge/fabric/StyleCommitHook.h>

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
  // changes back into its own sync pass. Commits issued by the
  // ShadowTreeSynchronizer (the direct-commit path) carry the merged
  // styles already — re-processing them would double-count mutations, so
  // they pass through with their Unknown source.
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
  // Persistence against React re-commits: React keeps its own per-fiber
  // ShadowNode references from before any native merge and rebuilds the
  // root from them (completeRoot), so a commit arriving after our merge
  // can resurface pre-merge props. mergePendingIntoRoot detects that via
  // node identity (per-binding appliedNode) and re-merges, not only when a
  // new generation is pending.
  return registry_.withLock([&](StyleRegistry& registry) {
    auto merged = registry.mergePendingIntoRoot(
        shadowTree.getSurfaceId(), newRootShadowNode);
    if (merged != newRootShadowNode) {
      commitsMutated_.fetch_add(1, std::memory_order_relaxed);
    }
    return merged;
  });
}

uint64_t StyleCommitHook::commitsObserved() const {
  return commitsObserved_.load(std::memory_order_relaxed);
}

uint64_t StyleCommitHook::commitsMutated() const {
  return commitsMutated_.load(std::memory_order_relaxed);
}

} // namespace windforge::fabric
