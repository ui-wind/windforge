#pragma once

#include <ReactCommon/TurboModule.h>
#include <react/renderer/uimanager/UIManager.h>

#include <windforge/fabric/StyleCommitHook.h>
#include <windforge/fabric/StyleRegistry.h>

namespace windforge::fabric {

/**
 * Minimal TurboModule exposing the spike's mutation surface to JS.
 *
 * In production this would be a generated codegen module (JS spec → C++
 * bindings). For the spike the binding is handwritten because:
 *  1. it needs raw UIManager access, which generated modules do not get;
 *  2. the point is to prove the commit-hook mechanism, not codegen.
 *
 * The `uiManager` dependency is injected by the host (see the note in the
 * README on obtaining it from RCTSurfacePresenter).
 */
class WindforgeStyleModule final : public facebook::react::TurboModule {
 public:
  WindforgeStyleModule(
      facebook::react::UIManager& uiManager,
      std::shared_ptr<facebook::react::CallInvoker> jsInvoker);
  ~WindforgeStyleModule() override;

 private:
  void registerJsBindings();

  facebook::react::UIManager& uiManager_;
  StyleRegistry registry_;
  StyleCommitHook commitHook_;
};

} // namespace windforge::fabric
