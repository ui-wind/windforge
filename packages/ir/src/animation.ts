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
  timingFunction?: TimingFunctionIR;
  iterationCount?: number | 'infinite';
  direction?: AnimationDirection;
  fillMode?: AnimationFillMode;
};
