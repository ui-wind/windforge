import { describe, expect, it, beforeEach } from 'vitest';
import { __resetRegistry, registerArtifact } from '../src/registry.js';
import { __clearStyleCache, resolveClassNames, toReactNativeValue } from '../src/resolve.js';
import type { ConditionState } from '../src/state.js';
import type { RuntimeArtifact } from '../src/types.js';

const light: ConditionState = {
  colorScheme: 'light',
  platform: 'ios',
  windowWidth: 390,
  windowHeight: 844,
};

const artifact: RuntimeArtifact = {
  version: 1,
  irVersion: 1,
  hash: 'test',
  styles: {
    'p-4': {
      base: [{ property: 'padding', value: { kind: 'number', value: 16 }, sourceOrder: 0 }],
    },
    'w-1/2': {
      base: [
        {
          property: 'width',
          value: { kind: 'dimension', value: 50, unit: 'percent' },
          sourceOrder: 0,
        },
      ],
    },
    'bg-zinc-950': {
      base: [{ property: 'backgroundColor', value: { kind: 'color', value: '#09090b' }, sourceOrder: 0 }],
    },
    'dark:text-white': {
      base: [{ property: 'color', value: { kind: 'color', value: '#999999' }, sourceOrder: 0 }],
      variants: [
        {
          conditionIds: ['color-scheme:dark'],
          declarations: [
            { property: 'color', value: { kind: 'color', value: '#ffffff' }, sourceOrder: 0 },
          ],
        },
      ],
    },
    'sm:p-2': {
      base: [],
      variants: [
        {
          conditionIds: ['media-width:>=:640'],
          declarations: [{ property: 'padding', value: { kind: 'number', value: 8 }, sourceOrder: 0 }],
        },
      ],
    },
    'ios:bg-white': {
      base: [],
      variants: [
        {
          conditionIds: ['platform:ios'],
          declarations: [
            { property: 'backgroundColor', value: { kind: 'color', value: '#ffffff' }, sourceOrder: 0 },
          ],
        },
      ],
    },
  },
  conditions: [
    { kind: 'color-scheme', id: 'color-scheme:dark', scheme: 'dark' },
    {
      kind: 'media',
      id: 'media-width:>=:640',
      feature: 'min-width',
      value: { kind: 'dimension', value: 640, unit: 'px' },
    },
    { kind: 'platform', id: 'platform:ios', platform: 'ios' },
  ],
};

describe('resolution', () => {
  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    registerArtifact(artifact);
  });

  it('resolves base utilities', () => {
    expect(resolveClassNames('p-4 bg-zinc-950', light)).toEqual({
      padding: 16,
      backgroundColor: '#09090b',
    });
  });

  it('applies dark variants only in dark mode', () => {
    expect(resolveClassNames('dark:text-white', light)).toEqual({ color: '#999999' });
    expect(resolveClassNames('dark:text-white', { ...light, colorScheme: 'dark' })).toEqual({
      color: '#ffffff',
    });
  });

  it('applies width media variants above the breakpoint', () => {
    expect(resolveClassNames('sm:p-2', light)).toEqual({});
    expect(resolveClassNames('sm:p-2', { ...light, windowWidth: 640 })).toEqual({ padding: 8 });
  });

  it('applies platform variants', () => {
    expect(resolveClassNames('ios:bg-white', light)).toEqual({ backgroundColor: '#ffffff' });
    expect(resolveClassNames('ios:bg-white', { ...light, platform: 'android' })).toEqual({});
  });

  it('merges multiple classes, later wins', () => {
    expect(resolveClassNames('p-4 sm:p-2', { ...light, windowWidth: 800 })).toEqual({
      padding: 8,
    });
  });

  it('ignores unknown classes', () => {
    expect(resolveClassNames('nope p-4', light)).toEqual({ padding: 16 });
  });

  it('lowers percentages to RN percent strings', () => {
    expect(resolveClassNames('w-1/2', light)).toEqual({ width: '50%' });
  });

  it('invalidates the cache when a new artifact registers', () => {
    expect(resolveClassNames('p-4', light)).toEqual({ padding: 16 });
    registerArtifact({
      ...artifact,
      hash: 'v2',
      styles: {
        'p-4': {
          base: [{ property: 'padding', value: { kind: 'number', value: 24 }, sourceOrder: 0 }],
        },
      },
    });
    expect(resolveClassNames('p-4', light)).toEqual({ padding: 24 });
  });
});

describe('toReactNativeValue', () => {
  it('passes through static scalars', () => {
    expect(toReactNativeValue({ kind: 'number', value: 4 })).toBe(4);
    expect(toReactNativeValue({ kind: 'string', value: 'flex' })).toBe('flex');
    expect(toReactNativeValue({ kind: 'color', value: '#fff' })).toBe('#fff');
  });

  it('lowers transforms to RN transform arrays', () => {
    expect(
      toReactNativeValue({
        kind: 'transform',
        operations: [
          { operation: 'translateX', value: { kind: 'number', value: 4 } },
          { operation: 'scale', value: { kind: 'number', value: 2 } },
        ],
      }),
    ).toEqual([{ translateX: 4 }, { scale: 2 }]);
  });

  it('throws on unresolved token references', () => {
    expect(() => toReactNativeValue({ kind: 'token', ref: 'colors.primary' })).toThrow();
  });
});
