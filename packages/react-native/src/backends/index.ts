/**
 * Backend selection. The default is `js-baseline`; `fabric` is opt-in via
 * `selectBackend('fabric')` at app startup (before WindforgeProvider
 * mounts). Nothing outside this package's backends may import Fabric types.
 */
import { createFabricBackend } from './fabric.js';
import { createJsBaselineBackend } from './js-baseline.js';
import type { StyleBackend, StyleBackendName } from './types.js';

let current: StyleBackend | null = null;

/** Choose the active backend. Called once at app startup. */
export function selectBackend(name: StyleBackendName = 'js-baseline'): StyleBackend {
  current = name === 'fabric' ? createFabricBackend() : createJsBaselineBackend();
  return current;
}

/** The active backend; lazily defaults to `js-baseline`. */
export function getBackend(): StyleBackend {
  if (!current) current = createJsBaselineBackend();
  return current;
}

/** Test-only: reset selection. Not part of the public contract. */
export function __resetBackend(): void {
  current = null;
}
