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

  it('keeps state conditions inactive without component state', () => {
    const hover: ConditionIR = { kind: 'state', id: 'h', state: 'hover' };
    expect(evaluateCondition(hover, baseState)).toBe(false);
  });

  it('evaluates state conditions from component state', () => {
    const hover: ConditionIR = { kind: 'state', id: 'h', state: 'hover' };
    expect(evaluateCondition(hover, baseState, { hovered: true })).toBe(true);
    expect(evaluateCondition(hover, baseState, { pressed: true })).toBe(false);
    const active: ConditionIR = { kind: 'state', id: 'a', state: 'active' };
    expect(evaluateCondition(active, baseState, { pressed: true })).toBe(true);
    const focus: ConditionIR = { kind: 'state', id: 'f', state: 'focus' };
    expect(evaluateCondition(focus, baseState, { focused: true })).toBe(true);
    const disabled: ConditionIR = { kind: 'state', id: 'x', state: 'disabled' };
    expect(evaluateCondition(disabled, baseState, { disabled: true })).toBe(true);
  });

  it('never activates non-interactive pseudo states', () => {
    const visited: ConditionIR = { kind: 'state', id: 'v', state: 'visited' };
    expect(
      evaluateCondition(visited, baseState, {
        pressed: true,
        hovered: true,
        focused: true,
        disabled: true,
      }),
    ).toBe(false);
  });

  it('evaluates group state conditions from the groups slot', () => {
    const groupHover: ConditionIR = { kind: 'state', id: 'gh', state: 'hover', group: true };
    expect(evaluateCondition(groupHover, baseState, { groups: { '': { hovered: true } } })).toBe(true);
    expect(evaluateCondition(groupHover, baseState, { groups: { sidebar: { hovered: true } } })).toBe(false);
    expect(evaluateCondition(groupHover, baseState, { hovered: true })).toBe(false);
    const named: ConditionIR = {
      kind: 'state',
      id: 'ghn',
      state: 'hover',
      group: true,
      groupName: 'sidebar',
    };
    expect(evaluateCondition(named, baseState, { groups: { sidebar: { hovered: true } } })).toBe(true);
    expect(evaluateCondition(named, baseState, { groups: { '': { hovered: true } } })).toBe(false);
  });

  it('evaluates data conditions (presence and exact match)', () => {
    const presence: ConditionIR = { kind: 'data', id: 'data:open', name: 'open' };
    expect(evaluateCondition(presence, baseState)).toBe(false);
    expect(evaluateCondition(presence, baseState, { data: { open: true } })).toBe(true);
    expect(evaluateCondition(presence, baseState, { data: { open: '' } })).toBe(true);
    expect(evaluateCondition(presence, baseState, { data: { open: null } })).toBe(false);
    const exact: ConditionIR = {
      kind: 'data',
      id: 'data:selected=true',
      name: 'selected',
      value: 'true',
    };
    expect(evaluateCondition(exact, baseState, { data: { selected: true } })).toBe(true);
    expect(evaluateCondition(exact, baseState, { data: { selected: 'true' } })).toBe(true);
    expect(evaluateCondition(exact, baseState, { data: { selected: false } })).toBe(false);
    expect(evaluateCondition(exact, baseState, { data: {} })).toBe(false);
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
