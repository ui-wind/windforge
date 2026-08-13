/**
 * Animation IR.
 *
 * Animation is modeled separately from ordinary declarations (see IR spec,
 * "Animation IR"). This layer is descriptive only: keyframes, durations and
 * easing live here, but no Reanimated worklets, shared values or other
 * platform animation objects may appear. The Reanimated adapter translates
 * AnimationIR into its own runtime representation.
 */
import type { CanonicalProperty } from './properties.js';
import type { IRValue } from './values.js';

export type TimeIR = {
  /** Milliseconds. */
  ms: number;
};

export type TimingFunctionIR =
  | { kind: 'linear' }
  | { kind: 'ease' }
  | { kind: 'ease-in' }
  | { kind: 'ease-out' }
  | { kind: 'ease-in-out' }
  | { kind: 'cubic-bezier'; points: [number, number, number, number] }
  | { kind: 'steps'; steps: number; jump: 'start' | 'end' };

export type KeyframeIR = {
  /** 0..1 */
  offset: number;
  declarations: Array<{
    property: CanonicalProperty;
    value: IRValue;
  }>;
  /**
   * CSS `animation-timing-function` declared inside this keyframe block:
   * it applies to the segment that *starts* at this offset (the default
   * is the animation-level timing function).
   */
  easing?: TimingFunctionIR;
};

export type AnimationDirection =
  | 'normal'
  | 'reverse'
  | 'alternate'
  | 'alternate-reverse';

export type AnimationFillMode = 'none' | 'forwards' | 'backwards' | 'both';

export type AnimationIR = {
  name: string;
  keyframes: KeyframeIR[];
  duration?: TimeIR;
  /** `animation-delay` — the wait before the first iteration starts. */
  delay?: TimeIR;
  timingFunction?: TimingFunctionIR;
  iterationCount?: number | 'infinite';
  direction?: AnimationDirection;
  fillMode?: AnimationFillMode;
};

/**
 * Transition metadata lowered from `transition-*` utilities.
 *
 * `properties` is `'all'` for `transition-property: all` or the list of
 * canonical properties the transition covers. Per-class merge semantics live
 * in the runtime (composed-string resolution): when several tokens set
 * transitions, the later token wins per field (properties / duration / delay /
 * timingFunction). Like the rest of the animation IR this carries no
 * Reanimated types — backends translate it (Rule 2).
 */
export type TransitionIR = {
  properties: 'all' | CanonicalProperty[];
  duration?: TimeIR;
  delay?: TimeIR;
  timingFunction?: TimingFunctionIR;
};
