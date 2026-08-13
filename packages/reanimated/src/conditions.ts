/**
 * Worklet-safe condition state.
 *
 * `useAnimatedConditionState` mirrors the Windforge condition store into a
 * SharedValue so user worklets can read theme/platform/dimensions on the UI
 * thread. Pattern: SharedValue mirror + subscribe/dispose in an effect
 * (the unistyles `useAnimatedTheme` shape — prior art, pattern only).
 *
 * P0-minimal: a mirror for user worklets. Deep SharedValue binding into
 * style resolution (P1 parity row) is a follow-up.
 */
import { makeMutable, type SharedValue } from 'react-native-reanimated';
import {
  getConditions,
  subscribeConditions,
  type ConditionState,
} from '@windforge/react-native';
import { useEffect, useRef } from 'react';

export type AnimatedConditionState = SharedValue<ConditionState>;

/**
 * Live SharedValue mirror of the condition store. One SharedValue per
 * component instance; updates land through the store subscription (no
 * re-renders).
 */
export function useAnimatedConditionState(): AnimatedConditionState {
  const ref = useRef<AnimatedConditionState | null>(null);
  if (ref.current === null) ref.current = makeMutable(getConditions());

  useEffect(() => {
    const sharedValue = ref.current;
    if (!sharedValue) return undefined;
    return subscribeConditions(() => {
      sharedValue.value = getConditions();
    });
  }, []);

  return ref.current;
}
