#include <windforge/fabric/ShadowTreeSynchronizer.h>

#include <memory>

#include <react/renderer/mounting/ShadowTree.h>

namespace windforge::fabric {

namespace react = facebook::react;

ShadowTreeSynchronizer::ShadowTreeSynchronizer(
    react::UIManager& uiManager,
    StyleRegistry& registry)
    : uiManager_(uiManager), registry_(registry) {}

void ShadowTreeSynchronizer::commitAllPending() {
  uiManager_.getShadowTreeRegistry().enumerate(
      [&](react::ShadowTree const& shadowTree, bool& stop) {
        (void)stop;
        auto const surface = shadowTree.getSurfaceId();

        // Snapshot under the registry lock, commit outside it: the commit
        // invokes UIManager commit hooks (StyleCommitHook), which acquire
        // the same lock. The snapshot copies the props dynamics so a JS
        // updateStyles racing the commit cannot mutate what is being
        // applied; markApplied reconciles generations afterwards.
        auto snapshots = registry_.snapshotPending(surface);
        if (snapshots.empty()) {
          return;
        }

        // The snapshots applied by the winning transaction, captured out of
        // the commit so markApplied can record them after success.
        std::vector<StyleRegistry::AppliedEntry> applied;

        auto const status = shadowTree.commit(
            [&](react::RootShadowNode const& oldRootShadowNode)
                -> react::RootShadowNode::Unshared {
              // Re-runs on every CAS retry with the root React most
              // recently committed, so a concurrent React commit never
              // loses its changes to us (and vice versa).
              auto [merged, entries] =
                  mergeSnapshotsIntoRoot(oldRootShadowNode, snapshots);
              if (entries.empty()) {
                // None of the families survive under the current root
                // (unmounted mid-flight). Cancel instead of committing an
                // identical tree; the next commit prunes the bindings.
                return nullptr;
              }
              // Remember what the winning merge installed so the registry
              // can detect a React commit that later resurrects a pre-merge
              // node for these families.
              applied = std::move(entries);
              return std::move(merged);
            },
            {.enableStateReconciliation = false,
             .mountSynchronously = true,
             .source = react::ShadowTreeCommitSource::Unknown});

        if (status != react::ShadowTreeCommitStatus::Succeeded) {
          // Cancelled: every family unmounted mid-flight. Failed does not
          // happen — commit() retries the CAS loop until it succeeds.
          return;
        }
        registry_.markApplied(surface, applied);
        directCommits_.fetch_add(1, std::memory_order_relaxed);
      });
}

uint64_t ShadowTreeSynchronizer::directCommits() const {
  return directCommits_.load(std::memory_order_relaxed);
}

} // namespace windforge::fabric
