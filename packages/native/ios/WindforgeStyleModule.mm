#import <Foundation/Foundation.h>

#import <React/RCTBridgeModule.h>
#import <React/RCTInvalidating.h>
#import <React/RCTLog.h>
#import <React/RCTScheduler.h>
#import <React/RCTSurfacePresenter.h>
#import <React/RCTSurfacePresenterStub.h>
#import <ReactCommon/RCTInteropTurboModule.h>
#import <ReactCommon/RCTTurboModule.h>

#include <react/utils/FollyConvert.h>

#include <memory>

#include <windforge/fabric/StyleStore.h>

/**
 * `WindforgeStyle` TurboModule (iOS).
 *
 * Registration is automatic: RCT_EXPORT_MODULE puts the class in the
 * TurboModule registry — `RCTRegisterModule` requires RCTBridgeModule
 * conformance (all methods optional), and on the new architecture
 * RCTInstance injects the surface presenter through `setSurfacePresenter:`
 * (the same mechanism RCTNativeAnimatedModule relies on). From the
 * presenter the UIManager is reachable through fully public properties
 * (`RCTSurfacePresenter.scheduler.uiManager`), so no app-side setup and
 * no AppDelegate modification are required.
 *
 * JS interop uses the bridge-compatible RCT_EXPORT_METHOD form (NSObject
 * → folly::dynamic via react/utils/FollyConvert.h) rather than
 * codegen: the module needs raw UIManager access, which generated
 * bindings do not provide, and the surface is a fixed protocol contract
 * (docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md), not app codegen.
 * Because there is no generated spec, `getTurboModule:` must still return
 * a TurboModule C++ object or RCTTurboModuleManager hands JS `null` —
 * the same generic ObjCInteropTurboModule wrapper that legacy modules get
 * on the new architecture serves that role here.
 */
@interface WindforgeStyleModule
    : NSObject <RCTBridgeModule, RCTTurboModule, RCTInvalidating>
@end

@implementation WindforgeStyleModule {
  __weak RCTSurfacePresenter *_surfacePresenter;
  std::shared_ptr<windforge::fabric::StyleStore> _store;
  BOOL _installAttempted;
}

RCT_EXPORT_MODULE(WindforgeStyle)

/**
 * No codegen spec exists for this module, so wrap the RCT_EXPORT_METHOD
 * surface with the generic interop TurboModule (the one legacy modules
 * receive automatically). Without this, TurboModuleManager treats the
 * class as a pure TurboModule with no binding and JS resolves `null`.
 */
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::ObjCInteropTurboModule>(params);
}

- (void)setSurfacePresenter:(id<RCTSurfacePresenterStub>)surfacePresenter {
  _surfacePresenter = (RCTSurfacePresenter *)surfacePresenter;
  [self installIfReady];
}

/**
 * Builds the C++ delivery state on first availability of the UIManager.
 * Deferred installation (rather than doing it in the setter alone) also
 * covers reloads, where the presenter may arrive before the scheduler
 * exists.
 */
- (void)installIfReady {
  if (_store != nullptr || _installAttempted) {
    return;
  }
  RCTScheduler *scheduler = _surfacePresenter.scheduler;
  auto uiManager = scheduler.uiManager;
  if (uiManager == nullptr) {
    return;
  }
  _installAttempted = YES;
  _store = std::make_shared<windforge::fabric::StyleStore>(uiManager);
}

- (BOOL)ensureStore {
  [self installIfReady];
  if (_store == nullptr) {
    RCTLogWarn(
        @"@windforge/native: UIManager not available; "
        @"WindforgeStyle is a no-op until the surface presenter provides one.");
    return NO;
  }
  return YES;
}

- (void)invalidate {
  // RCTInvalidating contract (NSObject has no invalidate of its own):
  // unregister the commit hook and drop the bindings; a reload installs
  // a fresh store when the new presenter arrives.
  _store.reset();
  _installAttempted = NO;
}

RCT_EXPORT_METHOD(registerStyles : (NSDictionary *)classToStyle) {
  if (![self ensureStore]) {
    return;
  }
  _store->registerStyles(facebook::react::convertIdToFollyDynamic(classToStyle));
}

RCT_EXPORT_METHOD(updateStyles : (NSDictionary *)diff) {
  if (![self ensureStore]) {
    return;
  }
  _store->updateStyles(facebook::react::convertIdToFollyDynamic(diff));
}

RCT_EXPORT_METHOD(link : (nonnull NSNumber *)tag className : (NSString *)className) {
  if (![self ensureStore]) {
    return;
  }
  _store->link(
      static_cast<facebook::react::Tag>(tag.doubleValue),
      className.UTF8String);
}

RCT_EXPORT_METHOD(suspend : (nonnull NSNumber *)tag) {
  if (![self ensureStore]) {
    return;
  }
  _store->suspend(static_cast<facebook::react::Tag>(tag.doubleValue));
}

RCT_EXPORT_METHOD(unlink : (nonnull NSNumber *)tag) {
  if (![self ensureStore]) {
    return;
  }
  _store->unlink(static_cast<facebook::react::Tag>(tag.doubleValue));
}

RCT_EXPORT_METHOD(getDiagnostics : (RCTResponseSenderBlock)callback) {
  if (![self ensureStore]) {
    callback(@[ @{@"available": @NO} ]);
    return;
  }
  callback(@[ @{
    @"available": @YES,
    @"counters": facebook::react::convertFollyDynamicToId(_store->getDiagnostics()),
  } ]);
}

@end
