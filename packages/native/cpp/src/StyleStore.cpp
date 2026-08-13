#include <windforge/fabric/StyleStore.h>

namespace windforge::fabric {

namespace react = facebook::react;

StyleStore::StyleStore(std::shared_ptr<react::UIManager> uiManager)
    : uiManager_(std::move(uiManager)),
      commitHook_(*uiManager_, registry_),
      synchronizer_(*uiManager_, registry_) {}

void StyleStore::registerStyles(folly::dynamic const& classToStyle) {
  if (!classToStyle.isObject()) {
    return;
  }
  for (auto const& entry : classToStyle.items()) {
    registry_.updateStyle(entry.first.asString(), entry.second);
  }
  styleUpdates_.fetch_add(classToStyle.size(), std::memory_order_relaxed);
}

void StyleStore::updateStyles(folly::dynamic const& diff) {
  if (!diff.isObject() || diff.empty()) {
    return;
  }

  for (auto const& entry : diff.items()) {
    registry_.updateStyle(entry.first.asString(), entry.second);
  }
  styleUpdates_.fetch_add(diff.size(), std::memory_order_relaxed);

  // Deliver the change even though React has nothing to commit: commit the
  // pending bindings straight into each surface's ShadowTree, keyed by
  // family inside the tree's own transaction (ShadowTreeSynchronizer).
  synchronizer_.commitAllPending();
}

void StyleStore::link(react::Tag tag, std::string className) {
  // Tag → family lookup: findShadowNodeByTag_DEPRECATED is acceptable at
  // Phase 3 scale (it is the same primitive the UIManager's own update path
  // walks past); link happens once per mount, off the commit path.
  if (auto node = uiManager_->findShadowNodeByTag_DEPRECATED(tag)) {
    registry_.link(node->getFamilyShared(), std::move(className));
    links_.fetch_add(1, std::memory_order_relaxed);
  }
}

void StyleStore::suspend(react::Tag tag) {
  if (auto node = uiManager_->findShadowNodeByTag_DEPRECATED(tag)) {
    registry_.suspend(node->getFamilyShared());
  }
}

void StyleStore::unlink(react::Tag tag) {
  if (auto node = uiManager_->findShadowNodeByTag_DEPRECATED(tag)) {
    registry_.unlink(node->getFamilyShared());
  }
}

folly::dynamic StyleStore::getDiagnostics() const {
  folly::dynamic result = folly::dynamic::object();
  result["styles"] = static_cast<int64_t>(registry_.styleCount());
  result["bindings"] = static_cast<int64_t>(registry_.bindingCount());
  result["styleUpdates"] = static_cast<int64_t>(
      styleUpdates_.load(std::memory_order_relaxed));
  result["links"] = static_cast<int64_t>(links_.load(std::memory_order_relaxed));
  result["directCommits"] =
      static_cast<int64_t>(synchronizer_.directCommits());
  result["commitsObserved"] = static_cast<int64_t>(commitHook_.commitsObserved());
  result["commitsMutated"] = static_cast<int64_t>(commitHook_.commitsMutated());
  return result;
}

} // namespace windforge::fabric
