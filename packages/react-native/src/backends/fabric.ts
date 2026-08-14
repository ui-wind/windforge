/**
 * fabric backend: JS side of the native delivery protocol
 * (docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md).
 *
 * Ownership split:
 * - JS observes conditions (the provider calls onConditionsChanged) and
 *   diffs the affected **linked className strings** — O(unique className
 *   props), not O(components) — then pushes one update per change.
 * - Native owns delivery: the className → style registry, the family-keyed
 *   bindings, and the ShadowTree merge (see spikes/fabric-commit-hook for
 *   the piggyback commit reference implementation).
 *
 * Protocol key identity: a className string exactly as the component
 * received it (whitespace-normalized). JS resolves each class in the string
 * and pushes the merged result, so `registerStyles`/`updateStyles` keys
 * always match what `link` sends — native never sees individual utility
 * classes.
 *
 * This module never imports Fabric types (architecture §14); it talks to
 * native only through NativeStyleAdapter, which the app (or the native
 * package) installs before the provider mounts.
 */
import type { ConditionIR } from '@windforge/ir';
import { processColor } from 'react-native';
import { evaluateCondition } from '../conditions.js';
import { getArtifacts } from '../registry.js';
import { resolveClassNames, type ReactNativeStyle } from '../resolve.js';
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

/** Normalize a className prop to its protocol key (trimmed, single spaces). */
function normalizeClassName(className: string): string {
  return className.split(/\s+/).filter(Boolean).join(' ');
}

/**
 * Style props whose values must reach native as processed color integers.
 * React's own prop pipeline runs `processColor` on these before the value
 * crosses into C++; the C++ props parser only accepts that numeric form and
 * silently falls back to transparent for raw CSS strings. Styles pushed
 * through the delivery protocol bypass React's pipeline, so the backend
 * applies the same conversion at the native boundary.
 */
const COLOR_PROPS = new Set([
  'color',
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderStartColor',
  'borderEndColor',
  'outlineColor',
  'textShadowColor',
  'textDecorationColor',
  'tintColor',
  'overlayColor',
  'selectionColor',
  'placeholderTextColor',
]);

/** Convert color strings to processed integers for the native raw-props path. */
function toNativeStyle(style: ReactNativeStyle): ReactNativeStyle {
  let native: ReactNativeStyle | null = null;
  for (const [key, value] of Object.entries(style)) {
    if (typeof value === 'string' && COLOR_PROPS.has(key)) {
      const processed = processColor(value);
      if (processed != null) {
        native ??= { ...style };
        native[key] = processed;
      }
    }
  }
  return native ?? style;
}

/**
 * Build-time dependency data from the registry: className → condition ids
 * whose flip can change that class's resolved style. Merged across
 * artifacts, later registrations win per class (registry semantics).
 * Returns null when no registered artifact carries a `dependencies` map
 * (pre-dependency build): the backend then diffs every known class.
 */
function readDependencyData(): {
  dependencies: Map<string, readonly string[]>;
  conditions: ConditionIR[];
} | null {
  const artifacts = getArtifacts();
  if (artifacts.every((artifact) => artifact.dependencies === undefined)) {
    return null;
  }
  const dependencies = new Map<string, readonly string[]>();
  const conditions = new Map<string, ConditionIR>();
  for (const artifact of artifacts) {
    for (const condition of artifact.conditions) {
      conditions.set(condition.id, condition);
    }
    if (artifact.dependencies) {
      for (const [className, ids] of Object.entries(artifact.dependencies)) {
        dependencies.set(className, ids);
      }
    }
  }
  return { dependencies, conditions: [...conditions.values()] };
}

export function createFabricBackend(): StyleBackend {
  /** Unique normalized className strings observed via resolve/link — the diff domain. */
  const knownKeys = new Set<string>();
  /** className string → last serialized merged style pushed to native. */
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

  /**
   * Register every known className string that has not been synced to
   * native yet, keyed exactly as `link` will refer to it.
   */
  function registerPendingStyles(state: ConditionState): void {
    if (!nativeAdapter) return;
    const pending: Record<string, ReactNativeStyle> = {};
    for (const key of knownKeys) {
      if (pushed.has(key)) continue;
      const style = toNativeStyle(resolveClassNames(key, state));
      pending[key] = style;
      pushed.set(key, serializeStyle(style));
    }
    if (Object.keys(pending).length > 0) {
      nativeAdapter.registerStyles(pending);
    }
  }

  return {
    name: 'fabric',
    // Context re-renders are only needed while the native path is absent.
    requiresContext: () => nativeAdapter === null,
    resolveStyle(className, state, componentState) {
      // Normalize to the protocol key so registerStyles/updateStyles and
      // link always agree on what a mounted node is bound to.
      knownKeys.add(normalizeClassName(className));
      // Prefer the state the provider last observed: the context value is
      // frozen in fabric mode (that is what avoids re-renders), so late
      // mounts would otherwise resolve against stale conditions.
      // Component state (interaction/data facts) always comes from the
      // calling component — the native push path has no channel for it yet.
      return resolveClassNames(className, currentState ?? state, componentState);
    },
    link(handle, className, state) {
      if (!nativeAdapter) {
        warnDegraded();
        return;
      }
      registerPendingStyles(currentState ?? state);
      nativeAdapter.link(handle, normalizeClassName(className));
    },
    unlink(handle) {
      nativeAdapter?.unlink(handle);
    },
    onConditionsChanged(next, prev) {
      currentState = next;
      if (!nativeAdapter) {
        warnDegraded();
        return;
      }

      // Prefilter (Uniwind Pro-style build-time dependencies): a className
      // string whose classes all declare dependencies that evaluate
      // identically before and after the change cannot produce a different
      // merged style, so skip the resolve + serialize step for it entirely.
      // The serialized compare below stays as the no-op check. Absent
      // dependency data, every known key is considered (legacy behavior).
      let relevantKeys: Set<string> | null = null;
      const dependencyData = readDependencyData();
      if (dependencyData) {
        const changedIds = new Set<string>();
        for (const condition of dependencyData.conditions) {
          if (evaluateCondition(condition, prev) !== evaluateCondition(condition, next)) {
            changedIds.add(condition.id);
          }
        }
        relevantKeys = new Set();
        for (const key of knownKeys) {
          for (const name of key.split(' ')) {
            const ids = dependencyData.dependencies.get(name);
            if (ids && ids.some((id) => changedIds.has(id))) {
              relevantKeys.add(key);
              break;
            }
          }
        }
      }

      const diff: Record<string, ReactNativeStyle> = {};
      for (const key of knownKeys) {
        if (relevantKeys && !relevantKeys.has(key)) continue;
        const style = toNativeStyle(resolveClassNames(key, next));
        const serialized = serializeStyle(style);
        if (pushed.get(key) === serialized) continue;
        pushed.set(key, serialized);
        diff[key] = style;
      }
      if (Object.keys(diff).length > 0) {
        nativeAdapter.updateStyles(diff);
      }
    },
  };
}
