#pragma once

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Host-side glue for the commit-hook spike on iOS.
 *
 * Responsibilities:
 *  1. obtain the UIManager from the running surface presenter;
 *  2. construct the WindforgeStyleModule (registry + commit hook);
 *  3. expose it to the TurboModule registry so JS can reach it.
 *
 * On RN 0.86 the clean path is presenter.scheduler.uiManager — both are
 * public properties. No private hacking needed.
 */
@interface WFCommitHookSpikesHost : NSObject

/** Returns the installed module, or nil if the presenter has no UIManager. */
- (nullable id)installWithSurfacePresenter:(id)presenter;

@end

NS_ASSUME_NONNULL_END
