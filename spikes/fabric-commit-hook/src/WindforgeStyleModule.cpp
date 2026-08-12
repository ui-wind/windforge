#include <windforge/fabric/WindforgeStyleModule.h>

#include <folly/dynamic.h>
#include <jsi/JSIDynamic.h>
#include <jsi/jsi.h>

#include <react/renderer/core/ReactPrimitives.h>

namespace windforge::fabric {

namespace react = facebook::react;

WindforgeStyleModule::WindforgeStyleModule(
    react::UIManager& uiManager,
    std::shared_ptr<react::CallInvoker> jsInvoker)
    : TurboModule("WindforgeStyle", std::move(jsInvoker)),
      uiManager_(uiManager),
      commitHook_(uiManager, registry_) {
  registerJsBindings();
}

WindforgeStyleModule::~WindforgeStyleModule() = default;

void WindforgeStyleModule::registerJsBindings() {
  methodMap_ = {
      {"updateStyle",
       {2,
        [](jsi::Runtime& rt,
           TurboModule& module,
           jsi::Value const* args,
           size_t) -> jsi::Value {
          auto& self = static_cast<WindforgeStyleModule&>(module);
          auto className = args[0].asString(rt).utf8(rt);
          auto props = jsi::dynamicFromValue(rt, args[1]);
          self.registry_.updateStyle(std::move(className), std::move(props));
          return jsi::Value::undefined();
        }}},
      {"link",
       {2,
        [](jsi::Runtime& rt,
           TurboModule& module,
           jsi::Value const* args,
           size_t) -> jsi::Value {
          auto& self = static_cast<WindforgeStyleModule&>(module);
          auto tag = static_cast<react::Tag>(args[0].asNumber());
          auto className = args[1].asString(rt).utf8(rt);
          // Tag → family lookup is spike-only plumbing. Production resolves
          // the family on the thread that owns the tag (JS commit time) and
          // never needs the deprecated lookup.
          if (auto node = self.uiManager_.findShadowNodeByTag_DEPRECATED(tag)) {
            self.registry_.link(node->getFamilyShared(), std::move(className));
          }
          return jsi::Value::undefined();
        }}},
      {"suspend",
       {1,
        [](jsi::Runtime&,
           TurboModule& module,
           jsi::Value const* args,
           size_t) -> jsi::Value {
          auto& self = static_cast<WindforgeStyleModule&>(module);
          auto tag = static_cast<react::Tag>(args[0].asNumber());
          if (auto node = self.uiManager_.findShadowNodeByTag_DEPRECATED(tag)) {
            self.registry_.suspend(node->getFamilyShared());
          }
          return jsi::Value::undefined();
        }}},
      {"unlink",
       {1,
        [](jsi::Runtime&,
           TurboModule& module,
           jsi::Value const* args,
           size_t) -> jsi::Value {
          auto& self = static_cast<WindforgeStyleModule&>(module);
          auto tag = static_cast<react::Tag>(args[0].asNumber());
          if (auto node = self.uiManager_.findShadowNodeByTag_DEPRECATED(tag)) {
            self.registry_.unlink(node->getFamilyShared());
          }
          return jsi::Value::undefined();
        }}},
      {"getDiagnostics",
       {0,
        [](jsi::Runtime& rt,
           TurboModule& module,
           jsi::Value const*,
           size_t) -> jsi::Value {
          auto& self = static_cast<WindforgeStyleModule&>(module);
          folly::dynamic result = folly::dynamic::object();
          result["commitsObserved"] =
              static_cast<int64_t>(self.commitHook_.commitsObserved());
          result["commitsMutated"] =
              static_cast<int64_t>(self.commitHook_.commitsMutated());
          result["bindings"] =
              static_cast<int64_t>(self.registry_.bindingCount());
          return jsi::valueFromDynamic(rt, result);
        }}},
  };
}

} // namespace windforge::fabric
