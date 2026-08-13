import { describe, expect, it } from 'vitest';

import {
  hashCanonical,
  toCanonicalString,
  type AnimationIR,
  type KeyframeIR,
  type TimeIR,
  type TimingFunctionIR,
  type TransitionIR,
} from '../src/index.js';

const duration: TimeIR = { ms: 1000 };
const linear: TimingFunctionIR = { kind: 'linear' };

const spinKeyframes: KeyframeIR[] = [
  {
    offset: 0,
    declarations: [{ property: 'transform', value: { kind: 'transform', operations: [{ operation: 'rotate', value: { kind: 'string', value: '0deg' } }] } }],
  },
  {
    offset: 1,
    declarations: [{ property: 'transform', value: { kind: 'transform', operations: [{ operation: 'rotate', value: { kind: 'string', value: '360deg' } }] } }],
  },
];

const spin: AnimationIR = {
  name: 'spin',
  keyframes: spinKeyframes,
  duration,
  timingFunction: linear,
  iterationCount: 'infinite',
};

describe('AnimationIR', () => {
  it('round-trips keyframes, duration, timing function and iteration count', () => {
    expect(spin.name).toBe('spin');
    expect(spin.keyframes).toHaveLength(2);
    expect(spin.keyframes[0].offset).toBe(0);
    expect(spin.keyframes[1].offset).toBe(1);
    expect(spin.duration).toEqual({ ms: 1000 });
    expect(spin.timingFunction).toEqual({ kind: 'linear' });
    expect(spin.iterationCount).toBe('infinite');
    expect(spin.direction).toBeUndefined();
    expect(spin.fillMode).toBeUndefined();
  });

  it('supports finite iteration counts, direction and fill mode', () => {
    const ping: AnimationIR = {
      name: 'ping',
      keyframes: spinKeyframes,
      iterationCount: 3,
      direction: 'alternate',
      fillMode: 'both',
      delay: { ms: 150 },
    };
    expect(ping.iterationCount).toBe(3);
    expect(ping.direction).toBe('alternate');
    expect(ping.fillMode).toBe('both');
    expect(ping.delay).toEqual({ ms: 150 });
  });

  it('serializes deterministically (hash stability)', () => {
    // Field order in the literal must not affect the canonical form.
    const reordered: AnimationIR = {
      keyframes: spinKeyframes,
      name: 'spin',
      timingFunction: linear,
      duration,
      iterationCount: 'infinite',
    };
    expect(toCanonicalString(spin)).toBe(toCanonicalString(reordered));
    expect(hashCanonical(spin)).toBe(hashCanonical(reordered));
  });

  it('supports every TimingFunctionIR shape', () => {
    const kinds: TimingFunctionIR[] = [
      { kind: 'linear' },
      { kind: 'ease' },
      { kind: 'ease-in' },
      { kind: 'ease-out' },
      { kind: 'ease-in-out' },
      { kind: 'cubic-bezier', points: [0.4, 0, 0.2, 1] },
      { kind: 'steps', steps: 5, jump: 'start' },
      { kind: 'steps', steps: 3, jump: 'end' },
    ];
    for (const tf of kinds) {
      expect(toCanonicalString(tf)).toContain(tf.kind);
    }
    expect(hashCanonical(kinds[6])).not.toBe(hashCanonical(kinds[7]));
  });
});

describe('TransitionIR', () => {
  it('round-trips an all-properties transition', () => {
    const all: TransitionIR = {
      properties: 'all',
      duration: { ms: 500 },
      delay: { ms: 100 },
      timingFunction: { kind: 'ease-in-out' },
    };
    expect(all.properties).toBe('all');
    expect(all.duration).toEqual({ ms: 500 });
    expect(all.delay).toEqual({ ms: 100 });
    expect(all.timingFunction).toEqual({ kind: 'ease-in-out' });
  });

  it('round-trips a property-list transition with defaults omitted', () => {
    const colors: TransitionIR = { properties: ['color', 'backgroundColor'] };
    expect(colors.properties).toEqual(['color', 'backgroundColor']);
    expect(colors.duration).toBeUndefined();
    expect(colors.delay).toBeUndefined();
    expect(colors.timingFunction).toBeUndefined();
  });

  it('serializes deterministically (hash stability)', () => {
    const a: TransitionIR = {
      properties: 'all',
      duration: { ms: 500 },
      delay: { ms: 100 },
      timingFunction: { kind: 'cubic-bezier', points: [0.4, 0, 0.2, 1] },
    };
    const b: TransitionIR = {
      timingFunction: { kind: 'cubic-bezier', points: [0.4, 0, 0.2, 1] },
      delay: { ms: 100 },
      duration: { ms: 500 },
      properties: 'all',
    };
    expect(toCanonicalString(a)).toBe(toCanonicalString(b));
    expect(hashCanonical(a)).toBe(hashCanonical(b));
  });

  it('distinguishes property order (list order is semantic)', () => {
    const ab: TransitionIR = { properties: ['color', 'opacity'] };
    const ba: TransitionIR = { properties: ['opacity', 'color'] };
    expect(hashCanonical(ab)).not.toBe(hashCanonical(ba));
  });
});
