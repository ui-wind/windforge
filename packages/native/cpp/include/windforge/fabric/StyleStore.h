#pragma once

#include <atomic>
#include <cstdint>
#include <memory>

#include <folly/dynamic.h>
#include <react/renderer/uimanager/UIManager.h>

#include <windforge/fabric/StyleCommitHook.h>
#include <windforge/fabric/StyleRegistry.h>

namespace windforge::fabric {

/**
 * Owns the delivery state (registry + commit hook) and implements the
 * native half of NATIVE_DELIVERY_PROTOCOL_SPEC on top of a UIManager:
 *
 *  - registerStyles / updateStyles — className → resolved style maps from
 *    JS. updateStyles additionally pushes the changed styles down to every
 *    live binding via UIManager::updateShadowTree, which commits even when
 *    React itself has nothing to commit (e.g. a dark-mode toggle).
 *  - link / suspend / unlink — family-keyed bindings per mounted node.
 *  - getDiagnostics — counters used to verify the delivery path without
 *    making performance claims.
 *
 * This class is a plain C++ object so the platform TurboModule host (ObjC++
 * on iOS) stays a thin dispatcher; nothing here depends on a JS runtime.
 */
class StyleStore {
 public:
  /** `uiManager` must stay alive for the lifetime of the store. */
  explicit StyleStore(std::shared_ptr<facebook::react::UIManager> uiManager);
  ~StyleStore() = default;

  StyleStore(StyleStore const&) = delete;
  StyleStore& operator=(StyleStore const&) = delete;

  /** className → props map; initial sync from the artifact. */
  void registerStyles(folly::dynamic const& classToStyle);

  /**
   * className → props map; only the entries whose resolution changed.
   * Updates the registry, then pushes the new styles to live bindings
   * through UIManager::updateShadowTree.
   */
  void updateStyles(folly::dynamic const& diff);

  /** Bind a mounted node to a className. Tag is resolved to a family. */
  void link(facebook::react::Tag tag, std::string className);

  void suspend(facebook::react::Tag tag);
  void unlink(facebook::react::Tag tag);

  /** Counters for protocol verification (see the diagnostics table in the spec). */
  folly::dynamic getDiagnostics() const;

 private:
  std::shared_ptr<facebook::react::UIManager> uiManager_;
  StyleRegistry registry_;
  StyleCommitHook commitHook_;

  std::atomic<uint64_t> styleUpdates_{0};
  std::atomic<uint64_t> links_{0};
  std::atomic<uint64_t> pushes_{0};
};

} // namespace windforge::fabric
