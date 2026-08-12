/**
 * fabric backend: JS side of the native delivery protocol
 * (docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md).
 *
 * Ownership split:
 * - JS observes conditions (the provider calls onConditionsChanged) and
 *   diffs the affected **unique** classNames — O(unique classes), not
 *   O(components) — then pushes one update per change.
 * - Native owns delivery: the className → style registry, the family-keyed
 *   bindings, and the ShadowTree merge (see spikes/fabric-commit-hook for
 *   the piggyback commit reference implementation).
 *
 * This module never imports Fabric types (architecture §14); it talks to
 * native only through NativeStyleAdapter, which the app (or the future
 * native package) installs before the provider mounts.
 */
import { resolveClassName, resolveClassNames, type ReactNativeStyle } from '../resolve.js';
import type { ConditionState } from '../state.js';
import type { StyleBackend, StyleHandle } from './types.js';

/**
 * Transport contract toward the native module. The TurboModule
 * implementation lands in the native delivery phase; until then the backend
 * degrades to js-baseline behavior with a warning.
 */
export interface NativeStyleAdapter {
  /** Initial sync: className → resolved style map from the artifact. */
  registerStyles(map: Record<string, ReactNativeStyle>): void;
  /** Replace resolved values for the classNames that changed. */
  updateStyles(diff: Record<string, ReactNativeStyle>): void;
  /** Bind a mounted host node (tag) to a className. */
  link(handle: StyleHandle, className: string): void;
  /** Remove a binding on unmount. */
  unlink(handle: StyleHandle): void;
  /** Keep the binding but stop applying it (animation owns the props). */
  suspend?(handle: StyleHandle): void;
}

let nativeAdapter: NativeStyleAdapter | null = null;

/**
 * Install the native transport. Must be called before WindforgeProvider
 * mounts (module registration time is the intended slot).
 */
export function setFabricNativeAdapter(adapter: NativeStyleAdapter | null): void {
  nativeAdapter = adapter;
}

function serializeStyle(style: ReactNativeStyle): string {
  // Resolved styles are plain data produced by the compiler; key order is
  // deterministic per class (sourceOrder-sorted declarations), so a JSON
  // comparison is stable here.
  return JSON.stringify(style);
}

export function createFabricBackend(): StyleBackend {
  /** Unique classNames observed via resolve/link — the diff domain. */
  const knownClassNames = new Set<string>();
  /** className → last serialized style pushed to native. */
  const pushed = new Map<string, string>();
  let currentState: ConditionState | null = null;
  let degradedWarned = false;

  function warnDegraded(): void {
    if (degradedWarned) return;
    degradedWarned = true;
    console.warn(
      '@windforge/react-native: fabric backend selected but no native adapter ' +
        'is installed; falling back to JS resolution (context re-renders). ' +
        'Call setFabricNativeAdapter() before mounting WindforgeProvider.',
    );
  }

  /** Resolve every known class that has not been synced to native yet. */
  function registerPendingStyles(state: ConditionState): void {
    if (!nativeAdapter) return;
    const pending: Record<string, ReactNativeStyle> = {};
    for (const className of knownClassNames) {
      if (pushed.has(className)) continue;
      const style = resolveClassName(className, state) ?? {};
      pending[className] = style;
      pushed.set(className, serializeStyle(style));
    }
    if (Object.keys(pending).length > 0) {
      nativeAdapter.registerStyles(pending);
    }
  }

  return {
    name: 'fabric',
    // Context re-renders are only needed while the native path is absent.
    requiresContext: () => nativeAdapter === null,
    resolveStyle(className, state) {
      for (const name of className.split(/\s+/)) {
        if (name) knownClassNames.add(name);
      }
      // Prefer the state the provider last observed: the context value is
      // frozen in fabric mode (that is what avoids re-renders), so late
      // mounts would otherwise resolve against stale conditions.
      return resolveClassNames(className, currentState ?? state);
    },
    link(handle, className, state) {
      if (!nativeAdapter) {
        warnDegraded();
        return;
      }
      registerPendingStyles(currentState ?? state);
      nativeAdapter.link(handle, className);
    },
    unlink(handle) {
      nativeAdapter?.unlink(handle);
    },
    onConditionsChanged(next) {
      currentState = next;
      if (!nativeAdapter) {
        warnDegraded();
        return;
      }
      const diff: Record<string, ReactNativeStyle> = {};
      for (const className of knownClassNames) {
        const style = resolveClassName(className, next) ?? {};
        const serialized = serializeStyle(style);
        if (pushed.get(className) === serialized) continue;
        pushed.set(className, serialized);
        diff[className] = style;
      }
      if (Object.keys(diff).length > 0) {
        nativeAdapter.updateStyles(diff);
      }
    },
  };
}
