#pragma once

#include <atomic>
#include <cstdint>
#include <memory>

#include <react/renderer/uimanager/UIManager.h>

#include <windforge/fabric/StyleRegistry.h>

namespace windforge::fabric {

/**
 * Delivers condition-only style changes (dark-mode toggle, rotation,
 * breakpoint change) with zero React involvement: it commits the pending
 * style bindings straight into each surface's ShadowTree.
 *
 * Why not UIManager::updateShadowTree? That API keys updates by node TAG,
 * read outside the commit transaction, so a tag can be stale against a
 * concurrent React remount. This synchronizer commits by FAMILY inside the
 * tree's own CAS-retry transaction (ShadowTree::commit), which fixes both
 * problems at once: families are resolved against the root the transaction
 * is actually committing, and every retry re-evaluates against the newest
 * root React may have committed in the meantime.
 *
 * Commit semantics:
 *  - All pending bindings of a surface land in ONE transaction — one tree
 *    revision, so concurrent observers never see a half-applied change.
 *  - The registry keeps only the newest generation per className; fast
 *    toggles converge because every commit applies whatever is newest at
 *    that instant, and anything still pending is applied by the next
 *    commit (direct or React-merged).
 *  - The commit runs with source `Unknown` and mountSynchronously=true:
 *    the StyleCommitHook filters those out, so direct commits are never
 *    re-merged by the hook; React's own commits remain the persistence
 *    re-merge path.
 *  - Never holds the registry lock across ShadowTree::commit — the commit
 *    invokes UIManager commit hooks (our StyleCommitHook), which take that
 *    same lock.
 */
class ShadowTreeSynchronizer {
 public:
  /** `uiManager` must stay alive for the lifetime of the synchronizer. */
  ShadowTreeSynchronizer(
      facebook::react::UIManager& uiManager,
      StyleRegistry& registry);
  ~ShadowTreeSynchronizer() = default;

  ShadowTreeSynchronizer(ShadowTreeSynchronizer const&) = delete;
  ShadowTreeSynchronizer& operator=(ShadowTreeSynchronizer const&) = delete;

  /**
   * Commits every pending binding on every active surface. Called from the
   * JS thread after updateStyles; the registry mutex is never held across
   * the commit.
   */
  void commitAllPending();

  // --- Diagnostics ---------------------------------------------------------

  /** ShadowTree commits issued by the synchronizer (attempts). */
  uint64_t directCommits() const;

 private:
  facebook::react::UIManager& uiManager_;
  StyleRegistry& registry_;
  std::atomic<uint64_t> directCommits_{0};
};

} // namespace windforge::fabric
