import { describe, expect, it } from 'vitest';
import type { AnimationIR, IRValue, TransitionIR } from '@windforge/ir';
import { planKeyframes, planTransition, timingFunctionToEasing } from '../src/compile.js';

const rotateIR = (deg: string): IRValue => ({
  kind: 'transform',
  operations: [{ operation: 'rotate', value: { kind: 'string', value: deg } }],
});

const spinAnimation: AnimationIR = {
  name: 'spin',
  keyframes: [
    { offset: 1, declarations: [{ property: 'transform', value: rotateIR('360deg') }] },
  ],
  duration: { ms: 1000 },
  timingFunction: { kind: 'linear' },
  iterationCount: 'infinite',
};

describe('timingFunctionToEasing', () => {
  it('maps linear', () => {
    expect(timingFunctionToEasing({ kind: 'linear' })).toEqual({ kind: 'linear' });
  });

  it('maps cubic-bezier with its points', () => {
    expect(
      timingFunctionToEasing({ kind: 'cubic-bezier', points: [0.4, 0, 0.2, 1] }),
    ).toEqual({ kind: 'bezier', points: [0.4, 0, 0.2, 1] });
  });

  it('maps named keyword easings to their CSS bezier points', () => {
    expect(timingFunctionToEasing({ kind: 'ease' })).toEqual({
      kind: 'bezier',
      points: [0.25, 0.1, 0.25, 1],
    });
    expect(timingFunctionToEasing({ kind: 'ease-in' })).toEqual({
      kind: 'bezier',
      points: [0.42, 0, 1, 1],
    });
    expect(timingFunctionToEasing({ kind: 'ease-out' })).toEqual({
      kind: 'bezier',
      points: [0, 0, 0.58, 1],
    });
    expect(timingFunctionToEasing({ kind: 'ease-in-out' })).toEqual({
      kind: 'bezier',
      points: [0.42, 0, 0.58, 1],
    });
  });

  it('maps steps with the CSS jump → roundToNextStep relation', () => {
    expect(timingFunctionToEasing({ kind: 'steps', steps: 4, jump: 'end' })).toEqual({
      kind: 'steps',
      steps: 4,
      roundToNextStep: false,
    });
    expect(timingFunctionToEasing({ kind: 'steps', steps: 4, jump: 'start' })).toEqual({
      kind: 'steps',
      steps: 4,
      roundToNextStep: true,
    });
  });
});

describe('planKeyframes', () => {
  it('plans a two-frame (to-only) animation as one implicit-start segment', () => {
    const plan = planKeyframes(spinAnimation);
    expect(plan.delayMs).toBe(0);
    expect(plan.durationMs).toBe(1000);
    expect(plan.iterations).toBe('infinite');
    expect(plan.alternate).toBe(false);
    expect(plan.fillForwards).toBe(false);

    const transform = plan.properties[0];
    expect(transform?.property).toBe('transform');
    expect(transform?.initialValue).toBeUndefined();
    expect(transform?.segments).toEqual([
      {
        from: undefined,
        to: rotateIR('360deg'),
        durationMs: 1000,
        easing: { kind: 'linear' },
      },
    ]);
  });

  it('splits duration by offset span and applies per-keyframe easing to the segment that starts there', () => {
    const animation: AnimationIR = {
      name: 'spin-slow',
      keyframes: [
        {
          offset: 0,
          declarations: [
            { property: 'transform', value: rotateIR('0deg') },
            { property: 'opacity', value: { kind: 'number', value: 1 } },
          ],
        },
        {
          offset: 0.5,
          easing: { kind: 'ease-in' },
          declarations: [{ property: 'transform', value: rotateIR('180deg') }],
        },
        { offset: 1, declarations: [{ property: 'transform', value: rotateIR('360deg') }] },
      ],
      duration: { ms: 1000 },
      timingFunction: { kind: 'linear' },
      iterationCount: 'infinite',
    };
    const plan = planKeyframes(animation);

    const transform = plan.properties[0];
    expect(transform?.initialValue).toEqual(rotateIR('0deg'));
    expect(transform?.segments.map((s) => s.durationMs)).toEqual([500, 500]);
    // ease-in is declared at 50% → it applies to the 50%→100% segment.
    expect(transform?.segments[0]?.easing).toEqual({ kind: 'linear' });
    expect(transform?.segments[1]?.easing).toEqual({
      kind: 'bezier',
      points: [0.42, 0, 1, 1],
    });

    // opacity only appears at 0% → no segments to run, so it carries no plan.
    expect(plan.properties.map((p) => p.property)).toEqual(['transform']);
  });

  it('a property missing at 0% animates from the current base value', () => {
    const plan = planKeyframes(spinAnimation);
    const segment = plan.properties[0]?.segments[0];
    expect(segment?.from).toBeUndefined();
    expect(segment?.durationMs).toBe(1000);
  });

  it('carries delay and forwards fill', () => {
    const plan = planKeyframes({
      ...spinAnimation,
      delay: { ms: 250 },
      fillMode: 'forwards',
    });
    expect(plan.delayMs).toBe(250);
    expect(plan.fillForwards).toBe(true);
    expect(planKeyframes({ ...spinAnimation, fillMode: 'both' }).fillForwards).toBe(true);
  });

  it('numeric iteration counts pass through', () => {
    const plan = planKeyframes({ ...spinAnimation, iterationCount: 3 });
    expect(plan.iterations).toBe(3);
    expect(planKeyframes(spinAnimation).iterations).toBe('infinite');
  });

  it('reverse swaps explicit segment directions', () => {
    const animation: AnimationIR = {
      name: 'grow',
      keyframes: [
        { offset: 0, declarations: [{ property: 'opacity', value: { kind: 'number', value: 0 } }] },
        { offset: 1, declarations: [{ property: 'opacity', value: { kind: 'number', value: 1 } }] },
      ],
      duration: { ms: 300 },
      direction: 'reverse',
    };
    const plan = planKeyframes(animation);
    const segments = plan.properties[0]?.segments ?? [];
    expect(segments.map((s) => s.to)).toEqual([{ kind: 'number', value: 0 }]);
    expect(segments.map((s) => s.from)).toEqual([{ kind: 'number', value: 1 }]);
  });

  it('alternate keeps forward segments and sets the repeat flag', () => {
    const animation: AnimationIR = {
      name: 'pulse',
      keyframes: [
        { offset: 0, declarations: [{ property: 'opacity', value: { kind: 'number', value: 1 } }] },
        { offset: 1, declarations: [{ property: 'opacity', value: { kind: 'number', value: 0.5 } }] },
      ],
      duration: { ms: 300 },
      direction: 'alternate',
    };
    const plan = planKeyframes(animation);
    expect(plan.alternate).toBe(true);
    expect(plan.properties[0]?.segments[0]?.to).toEqual({ kind: 'number', value: 0.5 });
  });

  it('alternate-reverse reverses segments and alternates', () => {
    const animation: AnimationIR = {
      name: 'grow',
      keyframes: [
        { offset: 0, declarations: [{ property: 'opacity', value: { kind: 'number', value: 0 } }] },
        { offset: 1, declarations: [{ property: 'opacity', value: { kind: 'number', value: 1 } }] },
      ],
      duration: { ms: 300 },
      direction: 'alternate-reverse',
    };
    const plan = planKeyframes(animation);
    expect(plan.alternate).toBe(true);
    expect(plan.properties[0]?.segments[0]?.to).toEqual({ kind: 'number', value: 0 });
  });
});

describe('planTransition', () => {
  const transition: TransitionIR = {
    properties: 'all',
    duration: { ms: 300 },
    delay: { ms: 50 },
    timingFunction: { kind: 'ease-in-out' },
  };
  const bezierInOut = { kind: 'bezier' as const, points: [0.42, 0, 0.58, 1] as const };

  it('animates numeric and color-string diffs under an all-covering transition', () => {
    const plan = planTransition(
      transition,
      { opacity: 0, backgroundColor: '#000000' },
      { opacity: 1, backgroundColor: '#ffffff' },
    );
    expect(plan.animations).toEqual([
      { property: 'opacity', to: 1, durationMs: 300, delayMs: 50, easing: bezierInOut },
      {
        property: 'backgroundColor',
        to: '#ffffff',
        durationMs: 300,
        delayMs: 50,
        easing: bezierInOut,
      },
    ]);
    expect(plan.snaps).toEqual({});
  });

  it('snaps unchanged properties, percentage strings and non-animatable values', () => {
    const plan = planTransition(
      transition,
      { width: '50%', transform: [{ rotate: '0deg' }], padding: 16 },
      { width: '75%', transform: [{ rotate: '45deg' }], padding: 16 },
    );
    expect(plan.animations).toEqual([]);
    expect(plan.snaps).toEqual({
      width: '75%',
      transform: [{ rotate: '45deg' }],
    });
  });

  it('a property list limits coverage', () => {
    const subset: TransitionIR = {
      properties: ['opacity'],
      duration: { ms: 100 },
    };
    const plan = planTransition(
      subset,
      { opacity: 0, width: 10 },
      { opacity: 1, width: 20 },
    );
    expect(plan.animations.map((a) => a.property)).toEqual(['opacity']);
    expect(plan.snaps).toEqual({ width: 20 });
  });

  it('new and removed properties snap', () => {
    const plan = planTransition(transition, { color: '#111111' }, { backgroundColor: '#222222' });
    expect(plan.animations).toEqual([]);
    expect(plan.snaps).toEqual({ backgroundColor: '#222222', color: undefined });
  });

  it('properties absent on both sides produce no work', () => {
    const plan = planTransition(transition, { opacity: 1 }, { opacity: 1 });
    expect(plan.animations).toEqual([]);
    expect(plan.snaps).toEqual({});
  });

  it('defaults to the CSS ease curve and zero timing when fields are missing', () => {
    const plan = planTransition({ properties: 'all' }, { opacity: 0 }, { opacity: 1 });
    expect(plan.animations[0]).toEqual({
      property: 'opacity',
      to: 1,
      durationMs: 0,
      delayMs: 0,
      easing: { kind: 'bezier', points: [0.25, 0.1, 0.25, 1] },
    });
  });
});
