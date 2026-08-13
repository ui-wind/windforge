/**
 * Animated theme transition progress.
 *
 * `useAnimatedThemeProgress` mirrors the color scheme into a SharedValue
 * that animates 0 (light) → 1 (dark) whenever the scheme flips. User
 * worklets interpolate colors/styles off it (`interpolateColor(progress,
 * [0, 1], [lightColor, darkColor])`) — interpolation runs entirely on the
 * UI thread, with zero React renders per frame (architecture Rule 6).
 *
 * Pattern prior art: unistyles `useAnimatedTheme` ({ activeTheme,
 * previousTheme, progress }) — MIT, pattern only.
 *
 * P0: progress for user interpolation. Auto-animating `dark:` variant
 * flips inside styled components is a follow-up.
 */
import { makeMutable, withTiming, type SharedValue } from 'react-native-reanimated';
import { AccessibilityInfo } from 'react-native';
import { getConditions, subscribeConditions } from '@windforge/react-native';
import { useEffect, useRef } from 'react';

const DEFAULT_DURATION_MS = 400;

export type AnimatedThemeProgressOptions = {
  /** Crossfade duration in ms. Default 400. */
  duration?: number;
};

/**
 * Live theme transition progress: 0 = light, 1 = dark. Animates on scheme
 * flips (interruptible — `withTiming` restarts from the current value);
 * snaps instantly when reduced motion is enabled.
 */
export function useAnimatedThemeProgress(
  options?: AnimatedThemeProgressOptions,
): SharedValue<number> {
  const ref = useRef<SharedValue<number> | null>(null);
  if (ref.current === null) {
    ref.current = makeMutable(getConditions().colorScheme === 'dark' ? 1 : 0);
  }

  useEffect(() => {
    const sharedValue = ref.current;
    if (!sharedValue) return undefined;
    const duration = options?.duration ?? DEFAULT_DURATION_MS;
    let reducedMotion = false;
    // One read at mount: the system setting is not expected to change
    // mid-session, and keeping the hook free of async state avoids a
    // re-render just to snap.
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        reducedMotion = enabled;
      })
      .catch(() => {});
    return subscribeConditions(() => {
      const target = getConditions().colorScheme === 'dark' ? 1 : 0;
      sharedValue.value = withTiming(target, {
        duration: reducedMotion ? 0 : duration,
      });
    });
  }, [options?.duration]);

  return ref.current;
}
