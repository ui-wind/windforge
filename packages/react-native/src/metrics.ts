/**
 * Platform metrics capability surface.
 *
 * Metrics are exposed as stable backend capabilities (RN Fabric backend
 * spec, "Native metrics"): font scale, pixel ratio, layout direction and
 * window dimensions ride the condition store; safe area insets are a
 * separate store because they are read-only metrics, not variant drivers,
 * and observing them requires an app to mount the optional safe-area
 * bridge (`@windforge/react-native/safe-area`).
 *
 * The insets store itself lives in `insets.ts` (dependency-free) so the
 * pure resolution layer can read it without pulling React in.
 */
import { useSyncExternalStore } from 'react';
import { getInsets, subscribeInsets, type SafeAreaInsets } from './insets.js';
import { getConditions, subscribeConditions } from './provider.js';
import type { ConditionState } from './state.js';

export {
  __resetInsets,
  getInsets,
  setInsets,
  subscribeInsets,
  type SafeAreaInsets,
} from './insets.js';

/** Condition state plus the safe area insets, when observed. */
export type WindforgeMetrics = ConditionState & { insets: SafeAreaInsets | null };

/**
 * All observable platform metrics in one snapshot. The result is memoized:
 * `useSyncExternalStore` requires a stable snapshot between store changes,
 * and the conditions/insets references only change when a store publishes.
 */
let metricsConditions: ConditionState = getConditions();
let metricsInsets: SafeAreaInsets | null = getInsets();
let metricsSnapshot: WindforgeMetrics = { ...metricsConditions, insets: metricsInsets };

export function getMetrics(): WindforgeMetrics {
  const currentConditions = getConditions();
  const currentInsets = getInsets();
  if (currentConditions !== metricsConditions || currentInsets !== metricsInsets) {
    metricsConditions = currentConditions;
    metricsInsets = currentInsets;
    metricsSnapshot = { ...currentConditions, insets: currentInsets };
  }
  return metricsSnapshot;
}

const noopSubscribe = () => () => {};

function subscribeMetrics(listener: () => void): () => void {
  const unsubscribeConditions = subscribeConditions(listener);
  const unsubscribeInsets = subscribeInsets(listener);
  return () => {
    unsubscribeConditions();
    unsubscribeInsets();
  };
}

/**
 * Live metrics snapshot. Pass `subscribe = false` to read without
 * re-rendering on change (fabric backend components).
 */
export function useMetrics(subscribe = true): WindforgeMetrics {
  return useSyncExternalStore(subscribe ? subscribeMetrics : noopSubscribe, getMetrics, getMetrics);
}

/** Live safe area insets (null until a safe-area bridge publishes them). */
export function useInsets(subscribe = true): SafeAreaInsets | null {
  return useSyncExternalStore(
    subscribe ? subscribeInsets : noopSubscribe,
    getInsets,
    getInsets,
  );
}
