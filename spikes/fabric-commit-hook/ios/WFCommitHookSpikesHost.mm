#import "WFCommitHookSpikesHost.h"

#import <React/Fabric/RCTScheduler.h>
#import <React/Fabric/RCTSurfacePresenter.h>
#import <ReactCommon/RCTTurboModule.h>

#include <windforge/fabric/WindforgeStyleModule.h>

using namespace windforge::fabric;

/**
 * TurboModule wrapper so the C++ module participates in the standard
 * ObjC++ TurboModule registry lookup.
 */
@interface WFCommitHookSpikesModule : NSObject <RCTTurboModule>
@end

@implementation WFCommitHookSpikesModule

RCT_EXPORT_MODULE(WindforgeStyle)

@end

@implementation WFCommitHookSpikesHost {
  std::shared_ptr<WindforgeStyleModule> _module;
}

- (nullable id)installWithSurfacePresenter:(id)presenter {
  // The clean public path on RN 0.86:
  //   RCTSurfacePresenter.scheduler → RCTScheduler.uiManager (shared_ptr).
  RCTScheduler *scheduler = nil;
  @try {
    scheduler = [presenter valueForKey:@"scheduler"];
  } @catch (NSException *exception) {
    return nil;
  }
  if (scheduler == nil) {
    return nil;
  }

  auto uiManagerSharedPtr = scheduler.uiManager;
  if (uiManagerSharedPtr == nullptr) {
    return nil;
  }

  _module = std::make_shared<WindforgeStyleModule>(*uiManagerSharedPtr, nullptr);
  // Registration with the TurboModule registry is left to the host app:
  // return the module so the integration test can install it exactly the
  // way the app's RCTTurboModuleRegistry expects.
  return (id)_module.get();
}

@end
