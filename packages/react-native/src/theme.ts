/**
 * ThemeStore — module-level subscription store for named themes (Phase 12).
 *
 * Mirrors the conditions store pattern in provider.tsx: a plain object
 * published via Set<() => void> and consumed through useSyncExternalStore.
 *
 * The store tracks two fields:
 * - `requested` — what the user asked for (`'light'`, `'sunset'`, `'system'`).
 * - `current`   — resolved theme name (never `'system'`; when requested is
 *   `'system'`, current equals the last known colorScheme).
 *
 * provider.tsx keeps conditions.theme in sync by subscribing to this store,
 * and seeds the initial colorScheme via `syncThemeColorScheme`.
 */
import { useSyncExternalStore } from 'react';
import { getBackend } from './backends/index.js';

export type ThemeState = {
  /** What the user requested; `'system'` resolves to the OS color scheme. */
  requested: string | 'system';
  /** Resolved theme name (never `'system'`). */
  current: string;
};

let state: ThemeState = { requested: 'system', current: 'light' };
const subscribers = new Set<() => void>();

/** Last known color scheme; seeded by provider.tsx at mount and updated on
 *  Appearance changes. Used to resolve `requested === 'system'`. */
let lastColorScheme: 'light' | 'dark' = 'light';

function resolveCurrent(requested: string | 'system'): string {
  if (requested === 'system') return lastColorScheme;
  return requested;
}

function notify(): void {
  for (const listener of [...subscribers]) listener();
}

export function getThemeState(): ThemeState {
  return state;
}

export function subscribeTheme(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

/**
 * Set the active theme. Pass `'system'` to follow the OS color scheme.
 * Throws for unregistered names only when validation is enabled externally
 * (this store does not own the registry of valid theme names).
 */
export function setTheme(name: string | 'system'): void {
  const prev = state.current;
  const current = resolveCurrent(name);
  state = { requested: name, current };
  if (state.current !== prev) {
    getBackend().onThemeChanged?.(state.current, prev);
  }
  notify();
}

/**
 * Called by WindforgeProvider when the system color scheme changes. If
 * requested === 'system', resolves current to the new scheme and notifies.
 */
export function syncThemeColorScheme(scheme: 'light' | 'dark'): void {
  lastColorScheme = scheme;
  if (state.requested === 'system' && state.current !== scheme) {
    const prev = state.current;
    state = { ...state, current: scheme };
    getBackend().onThemeChanged?.(state.current, prev);
    notify();
  }
}

/**
 * Seed the initial color scheme at provider mount. Unlike
 * `syncThemeColorScheme`, this always updates `lastColorScheme` and resolves
 * current if requested is still 'system'.
 */
export function initThemeColorScheme(scheme: 'light' | 'dark'): void {
  lastColorScheme = scheme;
  if (state.requested === 'system' && state.current !== scheme) {
    const prev = state.current;
    state = { ...state, current: scheme };
    getBackend().onThemeChanged?.(state.current, prev);
    notify();
  }
}

const noopSubscribe = () => () => {};

/** Test helper — restore the initial store state between tests. */
export function __resetThemeState(): void {
  state = { requested: 'system', current: 'light' };
  lastColorScheme = 'light';
}

/** Subscribe to theme changes and return the current snapshot. */
export function useWindforgeTheme(subscribe = true): ThemeState {
  return useSyncExternalStore(
    subscribe ? subscribeTheme : noopSubscribe,
    getThemeState,
    getThemeState,
  );
}
