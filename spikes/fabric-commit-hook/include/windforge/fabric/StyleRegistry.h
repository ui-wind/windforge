#pragma once

#include <cstddef>
#include <cstdint>
#include <mutex>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <folly/dynamic.h>
#include <react/renderer/components/root/RootShadowNode.h>
#include <react/renderer/core/ShadowNodeFamily.h>

namespace windforge::fabric {

/**
 * A fully resolved style for one className, prepared by the JS side and
 * merged into props by the commit hook.
 */
struct ResolvedStyle {
  /** RawProps payload, e.g. {"backgroundColor": "#3b82f6", "padding": 16}. */
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
 * node pointer would dangle as soon as React commits.
 *
 * Threading: the JS thread calls updateStyle/link/suspend/unlink; the
 * commit hook calls everything under withLock() from the shadow/commit
 * thread. One coarse mutex is defensible because the critical sections are
 * short — heavy style resolution happens on the JS side, outside the lock.
 */
class StyleRegistry {
 public:
  using FamilyShared = facebook::react::ShadowNodeFamily::Shared;

  // --- Mutation surface (JS thread) --------------------------------------

  /** Upserts the resolved props for a className and bumps its generation. */
  void updateStyle(std::string className, folly::dynamic props);

  /** Binds a mounted family to a className, replacing any prior binding. */
  void link(FamilyShared family, std::string className);

  /** Keeps the binding but makes the commit hook skip the family. */
  void suspend(FamilyShared const& family);

  /** Removes the binding; call when the component unmounts. */
  void unlink(FamilyShared const& family);

  // --- Commit surface (call only inside withLock) -------------------------

  struct PendingBinding {
    FamilyShared family;
    std::shared_ptr<ResolvedStyle const> style;
  };

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

  /** Drops bindings whose family is no longer present under `root`. */
  void pruneUnmountedEntries(facebook::react::RootShadowNode const& root);

  /** Bindings whose style generation is newer than what was last applied. */
  std::vector<PendingBinding> collectPending(
      facebook::react::SurfaceId surface) const;

  /** Records the applied generation for each binding after a successful clone. */
  void markApplied(std::vector<PendingBinding> const& applied);

  /** Diagnostics: number of live bindings. */
  std::size_t bindingCount();

 private:
  struct Binding {
    std::string className;
    uint64_t appliedGeneration{0};
    bool suspended{false};
  };

  mutable std::mutex mutex_;
  std::unordered_map<std::string, std::shared_ptr<ResolvedStyle>> styles_;
  std::unordered_map<FamilyShared, Binding> bindings_;
};

} // namespace windforge::fabric
