#pragma once

#include <atomic>
#include <cstdint>

#include <react/renderer/uimanager/UIManager.h>
#include <react/renderer/uimanager/UIManagerCommitHook.h>

#include <windforge/fabric/StyleRegistry.h>

namespace windforge::fabric {

/**
 * Merges Windforge-resolved className styles into React's own commits.
 *
 * Instead of mutating the shadow tree from a side thread (which races
 * React's commits and tears frames), this hook participates in
 * shadowTreeWillCommit: it returns a cloned root with pending styles
 * merged in, and Fabric commits that tree as part of the same transaction.
 */
class StyleCommitHook final : public facebook::react::UIManagerCommitHook {
 public:
  /** Registers itself with `uiManager`. `registry` must outlive the hook. */
  StyleCommitHook(
      facebook::react::UIManager& uiManager,
      StyleRegistry& registry);
  ~StyleCommitHook() override;

  StyleCommitHook(StyleCommitHook const&) = delete;
  StyleCommitHook& operator=(StyleCommitHook const&) = delete;

  void commitHookWasRegistered(
      facebook::react::UIManager const& uiManager) noexcept override;
  void commitHookWasUnregistered(
      facebook::react::UIManager const& uiManager) noexcept override;

  facebook::react::RootShadowNode::Unshared shadowTreeWillCommit(
      facebook::react::ShadowTree const& shadowTree,
      facebook::react::RootShadowNode::Shared const& oldRootShadowNode,
      facebook::react::RootShadowNode::Unshared const& newRootShadowNode,
      facebook::react::ShadowTreeCommitOptions const& options)
      noexcept override;

  // --- Diagnostics (kill criteria #3 and #4) -----------------------------

  uint64_t commitsObserved() const;
  uint64_t commitsMutated() const;

 private:
  facebook::react::RootShadowNode::Unshared mergePendingStyles(
      facebook::react::ShadowTree const& shadowTree,
      facebook::react::RootShadowNode::Unshared const& newRootShadowNode);

  facebook::react::UIManager& uiManager_;
  StyleRegistry& registry_;
  std::atomic<uint64_t> commitsObserved_{0};
  std::atomic<uint64_t> commitsMutated_{0};
};

} // namespace windforge::fabric
