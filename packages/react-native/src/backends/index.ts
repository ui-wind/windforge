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

/**
 * Install a custom backend (docs/specs/EXTENSION_API_SPEC.md — custom
 * backend interface). Contract:
 *
 * - Must be the LAST backend-affecting call before `WindforgeProvider`
 *   mounts. `installNativeDelivery` (@windforge/native) ends with
 *   `selectBackend('fabric')` — a `setBackend` call made before it is
 *   silently overridden.
 * - A custom backend that wants native condition delivery should wrap or
 *   delegate to the fabric backend (via `selectBackend('fabric')`) instead
 *   of replacing it; replacing abandons the fabric instance's bindings.
 * - `resolveStyle` is on the render path (@windforge/reanimated calls it on
 *   every animated render), so it must resolve classNames correctly — a
 *   backend that fakes it breaks styled components and animated wrappers.
 */
export function setBackend(backend: StyleBackend): StyleBackend {
  current = backend;
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
