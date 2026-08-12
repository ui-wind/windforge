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
 * The hook provides persistence: whenever React commits new props for a
 * linked node, the React-owned props win and overwrite the styles Windforge
 * previously merged, so on every React commit this hook re-applies any
 * pending styles in the same transaction.
 *
 * It does NOT cover updates that never trigger a React commit (e.g. a
 * dark-mode toggle with no state change) — those are delivered through
 * UIManager::updateShadowTree by the module. The two mechanisms together
 * form the piggyback delivery mode of NATIVE_DELIVERY_PROTOCOL_SPEC.
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

  // --- Diagnostics ---------------------------------------------------------

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
