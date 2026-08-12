/**
 * IR value → React Native value lowering and className resolution.
 *
 * Pure logic (no react-native imports) so it stays testable and reusable by
 * the web backend. Every value reaching this module is static by contract:
 * the compiler resolved tokens/vars/calcs at build time.
 */
import type { DeclarationIR, IRValue, TransformOperationIR } from '@windforge/ir';
import { evaluateCondition } from './conditions.js';
import { getArtifacts, registryVersion } from './registry.js';
import { stateSignature, type ConditionState } from './state.js';
import type { ClassEntry, RuntimeArtifact } from './types.js';

export type ReactNativeStyle = Record<string, unknown>;

/** Lower one IR value to its React Native representation. */
export function toReactNativeValue(value: IRValue): unknown {
  switch (value.kind) {
    case 'number':
    case 'string':
    case 'color':
      return value.value;
    case 'dimension':
      if (value.unit === 'percent') return `${value.value}%`;
      // px/points: React Native treats plain numbers as points/dp already.
      return value.value;
    case 'list':
      return value.items.map(toReactNativeValue);
    case 'transform':
      return value.operations.map(toTransformObject);
    case 'token':
    case 'variable':
    case 'calc':
    case 'runtime':
      // The MVP contract lowers these at build time. If one survives, the
      // compiler and runtime versions disagree — fail loudly.
      throw new Error(
        `@windforge/react-native: unresolved ${value.kind} value reached the runtime; ` +
          'rebuild styles with a matching @windforge/tailwind',
      );
    case 'conditional':
      throw new Error(
        '@windforge/react-native: conditional values must be expanded at build time',
      );
  }
}

function toTransformObject(operation: TransformOperationIR): Record<string, unknown> {
  if (operation.operation === 'translate') {
    return {
      translate: [
        toReactNativeValue(operation.value[0]),
        toReactNativeValue(operation.value[1]),
      ],
    };
  }
  return { [operation.operation]: toReactNativeValue(operation.value) };
}

function declarationsToStyle(declarations: DeclarationIR[]): ReactNativeStyle {
  const style: ReactNativeStyle = {};
  // sourceOrder ascending preserves author order; priority descending would
  // win across documents, but within one artifact sourceOrder suffices.
  const sorted = [...declarations].sort(
    (a, b) => (a.sourceOrder ?? 0) - (b.sourceOrder ?? 0),
  );
  for (const declaration of sorted) {
    style[declaration.property] = toReactNativeValue(declaration.value);
  }
  return style;
}

/** Look up a class across artifacts; later registrations win. */
function findClassEntry(className: string): { entry: ClassEntry; artifact: RuntimeArtifact } | null {
  const artifacts = getArtifacts();
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const artifact = artifacts[i];
    if (!artifact) continue;
    const entry = artifact.styles[className];
    if (entry) return { entry, artifact };
  }
  return null;
}

/**
 * Resolve one class name for the given runtime state.
 * Returns null when the class is unknown (callers decide between skipping
 * and warning).
 */
export function resolveClassName(
  className: string,
  state: ConditionState,
): ReactNativeStyle | null {
  const found = findClassEntry(className);
  if (!found) return null;
  const { entry, artifact } = found;

  const signature = `${registryVersion()}|${className}|${stateSignature(state)}`;
  const cached = styleCache.get(signature);
  if (cached) return cached;

  const style = declarationsToStyle(entry.base);
  for (const variant of entry.variants ?? []) {
    const active = variant.conditionIds.every((id) => {
      const condition = artifact.conditions.find((c) => c.id === id);
      return condition ? evaluateCondition(condition, state) : false;
    });
    if (active) Object.assign(style, declarationsToStyle(variant.declarations));
  }

  styleCache.set(signature, style);
  if (styleCache.size > STYLE_CACHE_LIMIT) styleCache.clear();
  return style;
}

const STYLE_CACHE_LIMIT = 4096;
const styleCache = new Map<string, ReactNativeStyle>();

/** Test-only: clear the resolution cache. */
export function __clearStyleCache(): void {
  styleCache.clear();
}

/**
 * Resolve a className string (whitespace-separated list) into a single style
 * object. Unknown classes are skipped; later classes override earlier ones
 * on conflict, matching utility-css intuition.
 */
export function resolveClassNames(
  className: string,
  state: ConditionState,
): ReactNativeStyle {
  const merged: ReactNativeStyle = {};
  for (const name of className.split(/\s+/)) {
    if (!name) continue;
    const style = resolveClassName(name, state);
    if (style) Object.assign(merged, style);
  }
  return merged;
}
