/**
 * Animation planning — pure IR → plan translation.
 *
 * This module is the AnimationBackend's compile step (CODE_STRUCTURE): it
 * turns AnimationIR / TransitionIR into declarative plans the binding layer
 * (components.tsx) executes with Reanimated. It imports NO Reanimated types
 * so it runs in plain node tests, and easing is described through an
 * `EasingDescriptor` the binding maps onto `Easing.*` at runtime.
 */
import type {
  AnimationIR,
  CanonicalProperty,
  IRValue,
  TimingFunctionIR,
  TransitionIR,
} from '@windforge/ir';
import type { ReactNativeStyle } from '@windforge/react-native';

/** Reanimated-free description of an easing curve. */
export type EasingDescriptor =
  | { kind: 'linear' }
  | { kind: 'bezier'; points: [number, number, number, number] }
  | { kind: 'steps'; steps: number; roundToNextStep: boolean };

/** CSS keyword easings as cubic-bezier points (CSS Easing Functions L1). */
const NAMED_BEZIERS: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

export function timingFunctionToEasing(timingFunction: TimingFunctionIR): EasingDescriptor {
  switch (timingFunction.kind) {
    case 'linear':
      return { kind: 'linear' };
    case 'cubic-bezier':
      return { kind: 'bezier', points: timingFunction.points };
    case 'ease':
    case 'ease-in':
    case 'ease-out':
    case 'ease-in-out': {
      const points = NAMED_BEZIERS[timingFunction.kind];
      return points ? { kind: 'bezier', points } : { kind: 'linear' };
    }
    case 'steps':
      // CSS `jump-start` jumps immediately (round up to the next step).
      return {
        kind: 'steps',
        steps: timingFunction.steps,
        roundToNextStep: timingFunction.jump === 'start',
      };
  }
}

export type KeyframeSegment = {
  /** Value at segment start; undefined for the implicit start (animate from
   * the current base value). */
  from?: IRValue | undefined;
  to: IRValue;
  durationMs: number;
  easing: EasingDescriptor;
};

export type KeyframePropertyPlan = {
  property: CanonicalProperty;
  segments: KeyframeSegment[];
  /** Value at offset 0 when the keyframes define one. */
  initialValue?: IRValue | undefined;
};

export type KeyframePlan = {
  delayMs: number;
  /** Total single-iteration duration (0 = instantaneous segments). */
  durationMs: number;
  iterations: number | 'infinite';
  /** CSS `alternate` / `alternate-reverse` → withRepeat reverse flag. */
  alternate: boolean;
  /** CSS fill-mode keeps the final frame applied when the animation ends. */
  fillForwards: boolean;
  properties: KeyframePropertyPlan[];
};

/**
 * Plan a CSS keyframes animation as per-property segment sequences.
 *
 * CSS semantics preserved:
 * - durations split across segments by offset span;
 * - a keyframe's `animation-timing-function` applies to the segment that
 *   STARTS at that offset;
 * - a property absent at offset 0 animates from the current base value
 *   (`from: undefined`);
 * - `reverse` / `alternate-reverse` play segments backwards (segments are
 *   re-ordered here when every segment has an explicit start).
 */
export function planKeyframes(animation: AnimationIR): KeyframePlan {
  const frames = [...animation.keyframes].sort((a, b) => a.offset - b.offset);
  const totalMs = animation.duration?.ms ?? 0;
  const baseEasing = timingFunctionToEasing(animation.timingFunction ?? { kind: 'linear' });

  // Properties in first-appearance order.
  const ordered: CanonicalProperty[] = [];
  const seen = new Set<string>();
  for (const frame of frames) {
    for (const declaration of frame.declarations) {
      if (!seen.has(declaration.property)) {
        seen.add(declaration.property);
        ordered.push(declaration.property);
      }
    }
  }

  const properties: KeyframePropertyPlan[] = [];
  for (const property of ordered) {
    const entries: Array<{
      offset: number;
      value: IRValue | undefined;
      easing: TimingFunctionIR | undefined;
    }> = frames
      .filter((frame) => frame.declarations.some((d) => d.property === property))
      .map((frame) => {
        const declaration = frame.declarations.find((d) => d.property === property);
        return { offset: frame.offset, value: declaration?.value, easing: frame.easing };
      });
    const first = entries[0];
    if (!first) continue;

    const plan: KeyframePropertyPlan = { property, segments: [] };
    if (first.offset === 0) plan.initialValue = first.value;
    else {
      // Implicit start: animate from the current base value at offset 0.
      entries.unshift({ offset: 0, value: undefined, easing: undefined });
    }

    for (let i = 1; i < entries.length; i++) {
      const start = entries[i - 1];
      const end = entries[i];
      if (!start || !end || end.value === undefined) continue;
      plan.segments.push({
        from: start.value,
        to: end.value,
        durationMs: totalMs > 0 ? Math.round(totalMs * (end.offset - start.offset)) : 0,
        easing: start.easing ? timingFunctionToEasing(start.easing) : baseEasing,
      });
    }
    if (plan.segments.length > 0) properties.push(plan);
  }

  const direction = animation.direction ?? 'normal';
  const reverseSegments = direction === 'reverse' || direction === 'alternate-reverse';
  if (reverseSegments) {
    for (const plan of properties) {
      // Only reorder when every segment has an explicit start value; an
      // implicit-start animation reversed would need to target the base
      // value, which the binding cannot express as a segment target.
      if (!plan.segments.every((segment) => segment.from !== undefined)) continue;
      plan.segments = plan.segments.map((segment) => ({
        from: segment.to,
        to: segment.from as IRValue,
        durationMs: segment.durationMs,
        easing: segment.easing,
      }));
    }
  }

  return {
    delayMs: animation.delay?.ms ?? 0,
    durationMs: totalMs,
    iterations: animation.iterationCount ?? 1,
    alternate: direction === 'alternate' || direction === 'alternate-reverse',
    fillForwards: animation.fillMode === 'forwards' || animation.fillMode === 'both',
    properties,
  };
}

export type TransitionEntry = {
  property: string;
  to: unknown;
  durationMs: number;
  delayMs: number;
  easing: EasingDescriptor;
};

export type TransitionPlan = {
  /** Covered, animatable diffs — drive them with withTiming. */
  animations: TransitionEntry[];
  /** Everything else — apply directly to the base style. */
  snaps: ReactNativeStyle;
};

/** True when withTiming can interpolate the pair (numbers or color strings).
 * Percentage strings are NOT interpolated by withTiming and snap instead. */
function animatablePair(from: unknown, to: unknown): boolean {
  if (typeof from === 'number' && typeof to === 'number') return true;
  if (typeof from === 'string' && typeof to === 'string') {
    return !from.endsWith('%') && !to.endsWith('%');
  }
  return false;
}

/**
 * Diff two resolved styles against a TransitionIR. Properties the transition
 * covers AND withTiming can interpolate animate; everything else snaps. New
 * and removed properties always snap.
 */
export function planTransition(
  transition: TransitionIR,
  prev: ReactNativeStyle,
  next: ReactNativeStyle,
): TransitionPlan {
  const covered = transition.properties === 'all' ? null : new Set<string>(transition.properties);
  const durationMs = transition.duration?.ms ?? 0;
  const delayMs = transition.delay?.ms ?? 0;
  // The CSS default transition timing function is `ease`.
  const easing = timingFunctionToEasing(transition.timingFunction ?? { kind: 'ease' });

  const animations: TransitionEntry[] = [];
  const snaps: ReactNativeStyle = {};
  for (const [property, value] of Object.entries(next)) {
    const previous = prev[property];
    if (previous === value) continue;
    const isCovered = covered === null || covered.has(property);
    if (isCovered && previous !== undefined && animatablePair(previous, value)) {
      animations.push({ property, to: value, durationMs, delayMs, easing });
    } else {
      snaps[property] = value;
    }
  }
  for (const property of Object.keys(prev)) {
    if (!(property in next)) snaps[property] = undefined;
  }
  return { animations, snaps };
}
