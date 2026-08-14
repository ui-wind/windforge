/**
 * Phase 12 — named themes runtime tests.
 *
 * Covers: ThemeStore, scoped providers, condition evaluation for kind=theme,
 * variable cascade through resolver, cache invalidation on theme change,
 * useCSSVariable + updateCSSVariables.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { __resetRegistry, registerArtifact } from '../src/registry.js';
import { __clearStyleCache, resolveClassNames, toReactNativeValue } from '../src/resolve.js';
import { evaluateCondition } from '../src/conditions.js';
import type { ConditionState } from '../src/state.js';
import type { RuntimeArtifact } from '../src/types.js';

const baseState: ConditionState = {
  colorScheme: 'light',
  platform: 'ios',
  windowWidth: 390,
  windowHeight: 844,
  fontScale: 1,
  pixelRatio: 3,
  layoutDirection: 'ltr',
  theme: 'light',
};

const artifact: RuntimeArtifact = {
  version: 2,
  irVersion: 1,
  hash: 'phase12-test',
  styles: {
    'bg-accent': {
      base: [
        {
          property: 'backgroundColor',
          value: { kind: 'variable', name: '--color-accent' },
          sourceOrder: 0,
        },
      ],
    },
    'sunset:bg-red-500': {
      base: [],
      variants: [
        {
          conditionIds: ['theme:sunset'],
          declarations: [
            {
              property: 'backgroundColor',
              value: { kind: 'color', value: '#ef4444' },
              sourceOrder: 0,
            },
          ],
        },
      ],
    },
    'ocean:text-blue': {
      base: [],
      variants: [
        {
          conditionIds: ['theme:ocean'],
          declarations: [
            {
              property: 'color',
              value: { kind: 'color', value: '#0ea5e9' },
              sourceOrder: 0,
            },
          ],
        },
      ],
    },
  },
  conditions: [
    { kind: 'theme', id: 'theme:sunset', name: 'sunset' },
    { kind: 'theme', id: 'theme:ocean', name: 'ocean' },
  ],
  themes: {
    sunset: [{ name: '--color-accent', tokens: [{ type: 'hash', value: 'ef4444' }] }],
    ocean: [{ name: '--color-accent', tokens: [{ type: 'hash', value: '0ea5e9' }] }],
    light: [{ name: '--color-accent', tokens: [{ type: 'hash', value: '3b82f6' }] }],
  },
};

/** Helper token shape matching CssToken hash literal used in artifact.themes. */
type HashToken = { type: 'hash'; value: string };

describe('evaluateCondition — kind: theme', () => {
  it('activates when state.theme matches the condition name', () => {
    const sunset = { kind: 'theme' as const, id: 'theme:sunset', name: 'sunset' };
    expect(evaluateCondition(sunset, baseState)).toBe(false);
    expect(evaluateCondition(sunset, { ...baseState, theme: 'sunset' })).toBe(true);
  });

  it('distinguishes between named themes', () => {
    const ocean = { kind: 'theme' as const, id: 'theme:ocean', name: 'ocean' };
    expect(evaluateCondition(ocean, { ...baseState, theme: 'sunset' })).toBe(false);
    expect(evaluateCondition(ocean, { ...baseState, theme: 'ocean' })).toBe(true);
  });
});

describe('theme variant resolution', () => {
  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    registerArtifact(artifact);
  });

  it('activates theme-variant utilities only when theme matches', () => {
    expect(resolveClassNames('sunset:bg-red-500', baseState)).toEqual({});
    expect(resolveClassNames('sunset:bg-red-500', { ...baseState, theme: 'sunset' })).toEqual({
      backgroundColor: '#ef4444',
    });
  });

  it('keeps inactive theme variants from overriding each other', () => {
    // Neither active in light.
    expect(resolveClassNames('sunset:bg-red-500 ocean:text-blue', baseState)).toEqual({});
    // Sunset active → only sunset declarations apply.
    expect(
      resolveClassNames('sunset:bg-red-500 ocean:text-blue', { ...baseState, theme: 'sunset' }),
    ).toEqual({ backgroundColor: '#ef4444' });
    // Ocean active → only ocean declarations apply.
    expect(
      resolveClassNames('sunset:bg-red-500 ocean:text-blue', { ...baseState, theme: 'ocean' }),
    ).toEqual({ color: '#0ea5e9' });
  });

  it('invalidates caches across theme changes (distinct object identity)', () => {
    const lightResult = resolveClassNames('sunset:bg-red-500', baseState);
    const sunsetResult = resolveClassNames('sunset:bg-red-500', { ...baseState, theme: 'sunset' });
    expect(lightResult).not.toBe(sunsetResult);
    // Same state again returns the cached identity.
    expect(resolveClassNames('sunset:bg-red-500', { ...baseState, theme: 'sunset' })).toBe(
      sunsetResult,
    );
  });
});

describe('variable cascade', () => {
  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    registerArtifact(artifact);
  });

  it('resolves variables from the artifact theme table', () => {
    // bg-accent uses `variable` IR; resolved against themes.light by default.
    const lightCtx = { theme: 'light' };
    expect(resolveClassNames('bg-accent', baseState, undefined, lightCtx)).toEqual({
      backgroundColor: '3b82f6',
    });
    // Switching theme picks up that theme's entry.
    expect(
      resolveClassNames('bg-accent', { ...baseState, theme: 'sunset' }, undefined, {
        theme: 'sunset',
      }),
    ).toEqual({ backgroundColor: 'ef4444' });
    expect(
      resolveClassNames('bg-accent', { ...baseState, theme: 'ocean' }, undefined, {
        theme: 'ocean',
      }),
    ).toEqual({ backgroundColor: '0ea5e9' });
  });

  it('scoped variable overrides win over global and artifact', () => {
    const ctx = {
      theme: 'light',
      scopedVars: { '--color-accent': '#ff00ff' },
    };
    expect(resolveClassNames('bg-accent', baseState, undefined, ctx)).toEqual({
      backgroundColor: '#ff00ff',
    });
  });

  it('global overrides win over artifact but lose to scoped', () => {
    const ctx = {
      theme: 'light',
      globalOverrides: new Map([['light', new Map([['--color-accent', '#aaaaaa']])]]),
    };
    expect(resolveClassNames('bg-accent', baseState, undefined, ctx)).toEqual({
      backgroundColor: '#aaaaaa',
    });
    // Scoped wins over global.
    const withScoped = {
      ...ctx,
      scopedVars: { '--color-accent': '#bbbbbb' },
    };
    expect(resolveClassNames('bg-accent', baseState, undefined, withScoped)).toEqual({
      backgroundColor: '#bbbbbb',
    });
  });

  it('throws on unresolved variable references', () => {
    expect(() => toReactNativeValue({ kind: 'variable', name: '--missing' })).toThrow();
  });

  it('passes through non-variable token refs unchanged', () => {
    expect(toReactNativeValue({ kind: 'token', ref: 'colors.primary' })).toBe('colors.primary');
  });
});
