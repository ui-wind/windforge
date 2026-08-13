/**
 * Platform metrics capability surface.
 *
 * Metrics are exposed as stable backend capabilities (RN Fabric backend
 * spec, "Native metrics"): font scale, pixel ratio, layout direction and
 * window dimensions ride the condition store; safe area insets are a
 * separate store because they are read-only metrics, not variant drivers,
 * and observing them requires an app to mount the optional safe-area
 * bridge (`@windforge/react-native/safe-area`).
 */
import { useSyncExternalStore } from 'react';
import { getConditions, subscribeConditions } from './provider.js';
import type { ConditionState } from './state.js';

export type SafeAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** Condition state plus the safe area insets, when observed. */
export type WindforgeMetrics = ConditionState & { insets: SafeAreaInsets | null };

let insets: SafeAreaInsets | null = null;
const insetsSubscribers = new Set<() => void>();

export function getInsets(): SafeAreaInsets | null {
  return insets;
}

export function subscribeInsets(listener: () => void): () => void {
  insetsSubscribers.add(listener);
  return () => {
    insetsSubscribers.delete(listener);
  };
}

/**
 * Publish new safe area insets. Internal — called by the safe-area bridge
 * (`WindforgeSafeAreaProvider`); noop when nothing changed.
 */
export function setInsets(next: SafeAreaInsets | null): void {
  if (
    insets !== null &&
    next !== null &&
    insets.top === next.top &&
    insets.right === next.right &&
    insets.bottom === next.bottom &&
    insets.left === next.left
  ) {
    return;
  }
  insets = next;
  for (const listener of [...insetsSubscribers]) listener();
}

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

/** Test-only reset of the insets store. */
export function __resetInsets(): void {
  insets = null;
  insetsSubscribers.clear();
}
