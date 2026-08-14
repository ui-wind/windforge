/**
 * IR value → React Native value lowering and className resolution.
 *
 * Pure logic (no react-native imports) so it stays testable and reusable by
 * the web backend. Every value reaching this module is static by contract:
 * the compiler resolved tokens/vars/calcs at build time.
 */
import { parseStaticUtility } from '@windforge/ir';
import type {
  AnimationIR,
  DeclarationIR,
  IRValue,
  TransformOperationIR,
  TransitionIR,
} from '@windforge/ir';
import { evaluateCondition } from './conditions.js';
import {
  recordCacheHit,
  recordCacheMiss,
  recordFallbackMiss,
  recordFallbackParse,
  recordResolve,
} from './diagnostics.js';
import { getArtifacts, registryVersion } from './registry.js';
import {
  componentStateSignature,
  stateSignature,
  type ComponentState,
  type ConditionState,
} from './state.js';
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
 * One class resolved into specificity tiers.
 *
 * `base` holds unconditional declarations; `variant` holds declarations from
 * variants whose conditions are all active. Callers merge base first, then
 * layer every variant on top — mirroring CSS, where a conditional selector
 * (pseudo-class, group, data attribute) outranks a plain utility regardless
 * of token order in the className string.
 */
export type ResolvedTiers = {
  base: ReactNativeStyle;
  variant: ReactNativeStyle;
};

/**
 * Resolve one class name for the given runtime state, split by tier.
 *
 * Resolution order: style cache → build-time artifact entry → the controlled
 * runtime fallback parser (`parseStaticUtility`, cached, observable via
 * runtime diagnostics) → null. Unknown tokens the fallback cannot parse are
 * skipped by callers, with a WF2001 diagnostic recorded.
 *
 * `componentState` (Phase 11) evaluates `state`/`data` conditions against
 * the component's own interaction facts; omitted on global resolution paths.
 * The fallback parser emits static declarations only, so its output lands
 * entirely in the base tier.
 */
export function resolveClassNameTiers(
  className: string,
  state: ConditionState,
  componentState?: ComponentState,
): ResolvedTiers | null {
  recordResolve();
  const signature =
    `${registryVersion()}|${className}|${stateSignature(state)}` +
    `|${componentStateSignature(componentState)}`;
  const cached = styleCache.get(signature);
  if (cached) {
    recordCacheHit();
    return cached;
  }
  recordCacheMiss();

  const found = findClassEntry(className);
  let tiers: ResolvedTiers | null = null;
  if (found) {
    const { entry, artifact } = found;
    const variant: ReactNativeStyle = {};
    for (const rule of entry.variants ?? []) {
      const active = rule.conditionIds.every((id) => {
        const condition = artifact.conditions.find((c) => c.id === id);
        return condition ? evaluateCondition(condition, state, componentState) : false;
      });
      if (active) Object.assign(variant, declarationsToStyle(rule.declarations));
    }
    tiers = { base: declarationsToStyle(entry.base), variant };
  } else {
    // Build-time tables first; the fallback only covers a controlled subset
    // of static utilities and never replaces the artifact path.
    const declarations = parseStaticUtility(className);
    if (declarations) {
      recordFallbackParse();
      tiers = { base: declarationsToStyle(declarations), variant: {} };
    } else {
      recordFallbackMiss(className);
    }
  }

  if (tiers) {
    styleCache.set(signature, tiers);
    if (styleCache.size > STYLE_CACHE_LIMIT) styleCache.clear();
  }
  return tiers;
}

/**
 * Resolve one class name to a flat style object (base then active variants).
 * Prefer `resolveClassNameTiers` when merging multiple classes — a flat merge
 * loses the tier information `resolveClassNames` needs for CSS-like
 * specificity across tokens.
 */
export function resolveClassName(
  className: string,
  state: ConditionState,
  componentState?: ComponentState,
): ReactNativeStyle | null {
  const tiers = resolveClassNameTiers(className, state, componentState);
  return tiers ? { ...tiers.base, ...tiers.variant } : null;
}

const STYLE_CACHE_LIMIT = 4096;
/** Per-token cache: `registryVersion|token|stateSignature|componentStateSignature`
 * → class style split into base/variant tiers. */
const styleCache = new Map<string, ResolvedTiers>();
/** Composed-string cache (flyweight): identical className strings resolve to
 * the same object identity. */
const composedCache = new Map<string, ReactNativeStyle>();

/** Test-only: clear the resolution caches. */
export function __clearStyleCache(): void {
  styleCache.clear();
  composedCache.clear();
  metaCache.clear();
}

/**
 * Resolve a className string (whitespace-separated list) into a single style
 * object.
 *
 * Merge semantics mirror CSS specificity, not token position: all base
 * declarations merge in token order (later wins on conflict), then all
 * ACTIVE variant declarations layer on top in token order. A conditional
 * utility (`active:bg-red-500`, `group-hover:…`, `data-[…]`, `dark:…`)
 * therefore beats the base utility it restyles no matter which comes first
 * in the string — same as Tailwind's generated CSS, where the variant
 * selector is more specific.
 *
 * Results are cached by the full normalized string: repeated resolution of
 * the same string returns the SAME object (stable identity for cheap
 * downstream comparison), recomputed on condition or registry changes.
 */
export function resolveClassNames(
  className: string,
  state: ConditionState,
  componentState?: ComponentState,
): ReactNativeStyle {
  const tokens = className.split(/\s+/).filter(Boolean);
  const signature =
    `${registryVersion()}|${tokens.join(' ')}|${stateSignature(state)}` +
    `|${componentStateSignature(componentState)}`;
  const composed = composedCache.get(signature);
  if (composed) return composed;

  const merged: ReactNativeStyle = {};
  const variantOverlay: ReactNativeStyle = {};
  for (const name of tokens) {
    const tiers = resolveClassNameTiers(name, state, componentState);
    if (!tiers) continue;
    Object.assign(merged, tiers.base);
    Object.assign(variantOverlay, tiers.variant);
  }
  Object.assign(merged, variantOverlay);
  composedCache.set(signature, merged);
  if (composedCache.size > STYLE_CACHE_LIMIT) composedCache.clear();
  return merged;
}

export type AnimationMeta = {
  animation?: AnimationIR;
  transition?: TransitionIR;
};

/** Composed-string meta cache (flyweight): identical strings resolve to the
 * same object identity, keyed like style caches. */
const metaCache = new Map<string, AnimationMeta | null>();

/** Merge transition metadata per field: the later token wins per field
 * (mirrors the build-time merge in @windforge/tailwind). */
function mergeTransitionMeta(
  existing: TransitionIR | undefined,
  incoming: TransitionIR,
): TransitionIR {
  if (!existing) return incoming;
  const merged: TransitionIR = { properties: incoming.properties };
  const duration = incoming.duration ?? existing.duration;
  if (duration) merged.duration = duration;
  const delay = incoming.delay ?? existing.delay;
  if (delay) merged.delay = delay;
  const timingFunction = incoming.timingFunction ?? existing.timingFunction;
  if (timingFunction) merged.timingFunction = timingFunction;
  return merged;
}

/**
 * Resolve animation/transition metadata for a className string.
 *
 * Composed-string semantics match `resolveClassNames`: later tokens win —
 * animation replaces wholesale, transition merges per field. Animation
 * metadata is condition-independent (it only rides base rules), so no
 * ConditionState is needed. Tokens absent from the artifact (fallback-only)
 * contribute nothing: the controlled fallback emits static spacing only.
 *
 * Returns null when no token carries animation metadata.
 */
export function resolveAnimationMeta(className: string): AnimationMeta | null {
  const tokens = className.split(/\s+/).filter(Boolean);
  const signature = `${registryVersion()}|${tokens.join(' ')}`;
  const cached = metaCache.get(signature);
  if (cached !== undefined) return cached;

  let animation: AnimationIR | undefined;
  let transition: TransitionIR | undefined;
  for (const name of tokens) {
    const found = findClassEntry(name);
    if (!found) continue;
    if (found.entry.animation) animation = found.entry.animation;
    if (found.entry.transition) transition = mergeTransitionMeta(transition, found.entry.transition);
  }

  const meta: AnimationMeta | null = animation || transition ? {} : null;
  if (meta) {
    if (animation) meta.animation = animation;
    if (transition) meta.transition = transition;
  }
  metaCache.set(signature, meta);
  if (metaCache.size > STYLE_CACHE_LIMIT) metaCache.clear();
  return meta;
}
