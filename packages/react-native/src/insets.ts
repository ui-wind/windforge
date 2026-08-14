/**
 * Safe area insets store (Phase 15 — Uniwind Pro parity).
 *
 * Pure data store with no React or react-native imports so it can be
 * consumed by `resolve.ts` (which stays free of platform bindings) without
 * introducing a dependency cycle. The higher-level metrics surface
 * (`metrics.ts`) re-exports these for public API compatibility and adds
 * the React hooks.
 */
import { __bumpRegistryVersion } from './registry.js';

export type SafeAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

let insets: SafeAreaInsets | null = null;
const subscribers = new Set<() => void>();

export function getInsets(): SafeAreaInsets | null {
  return insets;
}

export function subscribeInsets(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

/**
 * Publish new safe area insets. Internal — called by the safe-area bridge
 * (`WindforgeSafeAreaProvider`). Bumps the registry version on change so
 * cached style resolutions are invalidated (safe-area values in artifacts
 * depend on this store). No-op when nothing changed.
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
  __bumpRegistryVersion();
  for (const listener of [...subscribers]) listener();
}

/** Test-only reset of the insets store. */
export function __resetInsets(): void {
  insets = null;
  subscribers.clear();
}
