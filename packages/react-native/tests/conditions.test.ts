import type { ConditionIR } from '@windforge/ir';
import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '../src/conditions.js';
import type { ConditionState } from '../src/state.js';

const baseState: ConditionState = {
  colorScheme: 'light',
  platform: 'ios',
  windowWidth: 390,
  windowHeight: 844,
  fontScale: 1,
  pixelRatio: 3,
  layoutDirection: 'ltr',
};

describe('evaluateCondition', () => {
  it('evaluates color-scheme', () => {
    const dark: ConditionIR = { kind: 'color-scheme', id: 'd', scheme: 'dark' };
    expect(evaluateCondition(dark, baseState)).toBe(false);
    expect(evaluateCondition(dark, { ...baseState, colorScheme: 'dark' })).toBe(true);
  });

  it('evaluates platform, including native = ios|android', () => {
    const ios: ConditionIR = { kind: 'platform', id: 'p', platform: 'ios' };
    const native: ConditionIR = { kind: 'platform', id: 'n', platform: 'native' };
    expect(evaluateCondition(ios, baseState)).toBe(true);
    expect(evaluateCondition(ios, { ...baseState, platform: 'android' })).toBe(false);
    expect(evaluateCondition(native, baseState)).toBe(true);
    expect(evaluateCondition(native, { ...baseState, platform: 'web' })).toBe(false);
  });

  it('evaluates width media features', () => {
    const minWidth: ConditionIR = {
      kind: 'media',
      id: 'w',
      feature: 'min-width',
      value: { kind: 'dimension', value: 640, unit: 'px' },
    };
    expect(evaluateCondition(minWidth, baseState)).toBe(false);
    expect(evaluateCondition(minWidth, { ...baseState, windowWidth: 640 })).toBe(true);
  });

  it('evaluates orientation from window dimensions', () => {
    const landscape: ConditionIR = {
      kind: 'media',
      id: 'o',
      feature: 'orientation',
      value: { kind: 'string', value: 'landscape' },
    };
    expect(evaluateCondition(landscape, baseState)).toBe(false);
    expect(evaluateCondition(landscape, { ...baseState, windowWidth: 844, windowHeight: 390 })).toBe(true);
  });

  it('does not evaluate interactive conditions in the MVP', () => {
    const hover: ConditionIR = { kind: 'state', id: 'h', state: 'hover' };
    expect(evaluateCondition(hover, baseState)).toBe(false);
  });

  it('evaluates layout-direction', () => {
    const rtl: ConditionIR = { kind: 'layout-direction', id: 'rtl', direction: 'rtl' };
    expect(evaluateCondition(rtl, baseState)).toBe(false);
    expect(evaluateCondition(rtl, { ...baseState, layoutDirection: 'rtl' })).toBe(true);
    const ltr: ConditionIR = { kind: 'layout-direction', id: 'ltr', direction: 'ltr' };
    expect(evaluateCondition(ltr, baseState)).toBe(true);
    expect(evaluateCondition(ltr, { ...baseState, layoutDirection: 'rtl' })).toBe(false);
  });
});
