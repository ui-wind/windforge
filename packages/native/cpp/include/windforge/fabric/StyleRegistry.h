#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

#include <folly/dynamic.h>
#include <react/renderer/components/root/RootShadowNode.h>
#include <react/renderer/core/ShadowNode.h>
#include <react/renderer/core/ShadowNodeFamily.h>
#include <react/renderer/core/ReactPrimitives.h>

namespace windforge::fabric {

/**
 * A fully resolved style for one className, prepared by the JS side and
 * merged into props at commit time.
 *
 * Instances are immutable from registration: updateStyle() swaps in a fresh
 * ResolvedStyle (copy-on-write) instead of mutating in place, so snapshots
 * handed to commit paths never observe props mid-update.
 */
struct ResolvedStyle {
  /**
   * RawProps payload, e.g. {"backgroundColor": 0xfffafafa, "padding": 16}.
   * Colors must already be processed integers — the C++ props parser has no
   * string-color support (the JS boundary runs processColor in toNativeStyle).
   */
  folly::dynamic props;
  /** Bumped every time JS pushes a new resolution for the className. */
  uint64_t generation{0};
};

/**
 * Registry of className → resolved style and ShadowNodeFamily → className
 * bindings.
 *
 * Keyed by ShadowNodeFamily (not ShadowNode*) because family identity
 * survives the immutable ShadowNode clones produced by every commit; a raw
 * node pointer would dangle as soon as React commits. Families are held as
 * shared_ptr keys (never raw pointers) so a binding cannot outlive its
 * family — this is a deliberate hardening over the raw-pointer keying used
 * by proprietary reference implementations.
 *
 * Threading: the JS thread calls updateStyle/link/suspend/unlink; the
 * commit hook calls everything under withLock() from the shadow/commit
 * thread; the direct-commit path (ShadowTreeSynchronizer) uses
 * snapshotPending()/markApplied(), which take the lock internally. One
 * coarse mutex is defensible because the critical sections are short —
 * heavy style resolution happens on the JS side, outside the lock.
 */
class StyleRegistry {
 public:
  using FamilyShared = facebook::react::ShadowNodeFamily::Shared;
  /** Canonical immutable node pointer (RN exposes no `ShadowNode::Shared`). */
  using NodeShared = std::shared_ptr<const facebook::react::ShadowNode>;

  // --- Mutation surface (JS thread) --------------------------------------

  /** Upserts the resolved props for a className and bumps its generation. */
  void updateStyle(std::string className, folly::dynamic props);

  /** Binds a mounted family to a className, replacing any prior binding. */
  void link(FamilyShared family, std::string className);

  /** Keeps the binding but makes commit paths skip the family. */
  void suspend(FamilyShared const& family);

  /** Removes the binding; call when the component unmounts. */
  void unlink(FamilyShared const& family);

  // --- Commit surface (call only inside withLock) -------------------------

  /**
   * Runs `fn` with the registry mutex held so the hook can snapshot
   * pending bindings, clone the tree, and record applied generations as one
   * atomic unit. `fn` must not call the JS-thread mutation methods
   * (the mutex is not recursive).
   */
  template <typename Fn>
  auto withLock(Fn&& fn) -> decltype(fn(std::declval<StyleRegistry&>())) {
    std::lock_guard<std::mutex> lock(mutex_);
    return fn(*this);
  }

  /**
   * Copies every pending binding for `surface` — style props included — so
   * the result can be committed without holding the registry lock.
   * Suspended bindings are excluded. Used by the direct-commit path.
   *
   * Pending means: the style's generation is newer than what the binding
   * last applied. (Regression detection — React re-committing a stale
   * pre-merge node — needs the tree and happens in mergePendingIntoRoot,
   * which runs with the root in hand.)
   */
  struct PendingSnapshot {
    FamilyShared family;
    std::string className;
    uint64_t generation;
    folly::dynamic props;
  };

  std::vector<PendingSnapshot> snapshotPending(
      facebook::react::SurfaceId surface);

  /** One snapshot applied to the tree, with the clone it produced. */
  struct AppliedEntry {
    FamilyShared family;
    std::string className;
    uint64_t generation;
    NodeShared node;
  };

  /**
   * Records each entry's generation as applied for its binding — but only
   * when the binding is still live, still bound to the same className, and
   * the style's current generation still equals the entry's. If JS pushed a
   * newer resolution since the snapshot was taken, the binding stays
   * pending so the next commit applies the newer value instead.
   *
   * The entry's clone node is recorded unconditionally: it is what the tree
   * currently carries, so regression detection must compare against it even
   * while a newer generation is still queued.
   */
  void markApplied(
      facebook::react::SurfaceId surface,
      std::vector<AppliedEntry> const& applied);

  /**
   * Merges the current resolution of every live binding for `surface` into
   * `root`: prune unmounted, collect what needs (re)merging, clone, record
   * applied. Returns `root` unchanged when nothing is pending or every
   * pending family is being unmounted.
   *
   * A binding needs (re)merging when the style's generation is newer than
   * what was last applied — or when the tree regressed: the bound family's
   * node is not the clone the previous merge produced. That happens when
   * React re-commits a ShadowNode it kept from before the merge (see the
   * persistence notes in StyleCommitHook).
   *
   * Runs under withLock() on the commit-hook path. The direct-commit path
   * cannot use this — ShadowTree::commit runs UIManager commit hooks (our
   * own StyleCommitHook among them) and the hook takes the registry lock,
   * so holding it across the commit would deadlock. That path uses
   * snapshotPending()/markApplied() instead (generation-pending only).
   */
  facebook::react::RootShadowNode::Unshared mergePendingIntoRoot(
      facebook::react::SurfaceId surface,
      facebook::react::RootShadowNode::Unshared const& root);

  // --- Diagnostics --------------------------------------------------------

  /** Diagnostics: number of live bindings. */
  std::size_t bindingCount() const;

  /** Diagnostics: number of registered classNames. */
  std::size_t styleCount() const;

 private:
  /** Drops bindings whose family is no longer present under `root`. */
  void pruneUnmountedEntries(facebook::react::RootShadowNode const& root);

  struct Binding {
    std::string className;
    uint64_t appliedGeneration{0};
    bool suspended{false};
    /**
     * The node clone that last carried this binding's merged style (owned —
     * the registry must not dangle on a node that the tree releases).
     * Cleared on link/suspend/unlink; reset whenever a newer generation is
     * queued. Used for regression detection in mergePendingIntoRoot.
     */
    NodeShared appliedNode;
  };

  mutable std::mutex mutex_;
  std::unordered_map<std::string, std::shared_ptr<ResolvedStyle>> styles_;
  std::unordered_map<FamilyShared, Binding> bindings_;
};

/**
 * Result of merging style snapshots into a tree.
 * `root` is null when no snapshot family exists under the tree (nothing
 * applied — e.g. every family unmounted mid-flight).
 */
struct MergeResult {
  facebook::react::RootShadowNode::Unshared root;
  std::vector<StyleRegistry::AppliedEntry> applied;
};

/**
 * Clones `root`, merging each snapshot's props into its family's node.
 * Only subtrees containing a snapshot family are cloned. Returns the
 * snapshots whose family was actually present (and therefore applied).
 *
 * Reads only the snapshot copies and the immutable tree; takes no locks —
 * safe inside a ShadowTree transaction (re-run on CAS retry) and under the
 * registry lock (commit-hook path).
 */
MergeResult mergeSnapshotsIntoRoot(
    facebook::react::RootShadowNode const& root,
    std::vector<StyleRegistry::PendingSnapshot> const& snapshots);

} // namespace windforge::fabric
