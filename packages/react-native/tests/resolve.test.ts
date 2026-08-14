import { describe, expect, it, beforeEach, vi } from 'vitest';
import { __resetRegistry, registerArtifact } from '../src/registry.js';
import {
  __clearStyleCache,
  resolveAnimationMeta,
  resolveClassNames,
  toReactNativeValue,
} from '../src/resolve.js';
import {
  __resetRuntimeDiagnostics,
  getRuntimeDiagnostics,
} from '../src/diagnostics.js';
import type { ConditionState } from '../src/state.js';
import type { RuntimeArtifact } from '../src/types.js';

const light: ConditionState = {
  colorScheme: 'light',
  platform: 'ios',
  windowWidth: 390,
  windowHeight: 844,
  fontScale: 1,
  pixelRatio: 3,
  layoutDirection: 'ltr',
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
    'active:bg-red-500': {
      base: [],
      variants: [
        {
          conditionIds: ['state:active'],
          declarations: [
            { property: 'backgroundColor', value: { kind: 'color', value: '#ef4444' }, sourceOrder: 0 },
          ],
        },
      ],
    },
    'group-hover:bg-blue-500': {
      base: [],
      variants: [
        {
          conditionIds: ['state:hover:group'],
          declarations: [
            { property: 'backgroundColor', value: { kind: 'color', value: '#3b82f6' }, sourceOrder: 0 },
          ],
        },
      ],
    },
    'data-[selected=true]:bg-emerald-500': {
      base: [],
      variants: [
        {
          conditionIds: ['data:selected=true'],
          declarations: [
            { property: 'backgroundColor', value: { kind: 'color', value: '#10b981' }, sourceOrder: 0 },
          ],
        },
      ],
    },
    'animate-spin': {
      base: [],
      animation: {
        name: 'spin',
        keyframes: [
          {
            offset: 1,
            declarations: [
              {
                property: 'transform',
                value: {
                  kind: 'transform',
                  operations: [
                    { operation: 'rotate', value: { kind: 'string', value: '360deg' } },
                  ],
                },
              },
            ],
          },
        ],
        duration: { ms: 1000 },
        timingFunction: { kind: 'linear' },
        iterationCount: 'infinite',
      },
    },
    transition: {
      base: [],
      transition: {
        properties: ['color', 'backgroundColor', 'borderColor', 'opacity', 'transform'],
        timingFunction: { kind: 'cubic-bezier', points: [0.4, 0, 0.2, 1] },
        duration: { ms: 150 },
      },
    },
    'duration-500': {
      base: [],
      transition: { properties: 'all', duration: { ms: 500 } },
    },
    'ease-in-out': {
      base: [],
      transition: {
        properties: 'all',
        timingFunction: { kind: 'cubic-bezier', points: [0.4, 0, 0.2, 1] },
      },
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
    { kind: 'state', id: 'state:active', state: 'active' },
    { kind: 'state', id: 'state:hover:group', state: 'hover', group: true },
    { kind: 'data', id: 'data:selected=true', name: 'selected', value: 'true' },
  ],
};

describe('resolution', () => {
  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    __resetRuntimeDiagnostics();
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

describe('component state (Phase 11)', () => {
  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    __resetRuntimeDiagnostics();
    registerArtifact(artifact);
  });

  it('keeps state/data variants inactive without component state', () => {
    expect(resolveClassNames('active:bg-red-500', light)).toEqual({});
    expect(resolveClassNames('group-hover:bg-blue-500', light)).toEqual({});
    expect(resolveClassNames('data-[selected=true]:bg-emerald-500', light)).toEqual({});
  });

  it('activates state variants from the component state flags', () => {
    expect(resolveClassNames('active:bg-red-500', light, { pressed: true })).toEqual({
      backgroundColor: '#ef4444',
    });
    // Wrong flag does not activate.
    expect(resolveClassNames('active:bg-red-500', light, { hovered: true })).toEqual({});
  });

  it('activates group variants from the groups slot', () => {
    expect(
      resolveClassNames('group-hover:bg-blue-500', light, {
        groups: { '': { hovered: true } },
      }),
    ).toEqual({ backgroundColor: '#3b82f6' });
    // The component's own hovered flag is not a group state.
    expect(resolveClassNames('group-hover:bg-blue-500', light, { hovered: true })).toEqual({});
  });

  it('activates data variants from the data slot', () => {
    expect(
      resolveClassNames('data-[selected=true]:bg-emerald-500', light, {
        data: { selected: true },
      }),
    ).toEqual({ backgroundColor: '#10b981' });
    expect(
      resolveClassNames('data-[selected=true]:bg-emerald-500', light, {
        data: { selected: 'false' },
      }),
    ).toEqual({});
  });

  it('variant declarations outrank base utilities regardless of token order', () => {
    // CSS specificity: a conditional selector beats the plain utility it
    // restyles, whether the variant token comes first …
    expect(
      resolveClassNames('active:bg-red-500 bg-zinc-950', light, { pressed: true }),
    ).toEqual({ backgroundColor: '#ef4444' });
    // … or second.
    expect(
      resolveClassNames('bg-zinc-950 active:bg-red-500', light, { pressed: true }),
    ).toEqual({ backgroundColor: '#ef4444' });
    // Idle: the base utility applies.
    expect(resolveClassNames('active:bg-red-500 bg-zinc-950', light)).toEqual({
      backgroundColor: '#09090b',
    });
  });

  it('group variants outrank base utilities too', () => {
    expect(
      resolveClassNames('group-hover:bg-blue-500 bg-zinc-950', light, {
        groups: { '': { hovered: true } },
      }),
    ).toEqual({ backgroundColor: '#3b82f6' });
  });

  it('keys caches by component state with stable identity', () => {
    const idle = resolveClassNames('active:bg-red-500', light);
    const pressed = resolveClassNames('active:bg-red-500', light, { pressed: true });
    expect(pressed).not.toBe(idle);
    expect(resolveClassNames('active:bg-red-500', light, { pressed: true })).toBe(pressed);
    expect(resolveClassNames('active:bg-red-500', light)).toBe(idle);
  });
});

describe('runtime fallback', () => {
  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    __resetRuntimeDiagnostics();
    registerArtifact(artifact);
  });

  it('resolves static spacing tokens absent from the artifact', () => {
    // p-7 is not in the artifact; the controlled fallback parses it.
    expect(resolveClassNames('p-7', light)).toEqual({ padding: 28 });
    expect(getRuntimeDiagnostics().fallbackParses).toBe(1);
  });

  it('keeps artifact entries ahead of the fallback', () => {
    // p-4 exists in the artifact and wins over the parsed value.
    expect(resolveClassNames('p-4', light)).toEqual({ padding: 16 });
    expect(getRuntimeDiagnostics().fallbackParses).toBe(0);
  });

  it('merges fallback and artifact classes, later wins', () => {
    expect(resolveClassNames('p-4 p-7', light)).toEqual({ padding: 28 });
    expect(resolveClassNames('p-7 p-4', light)).toEqual({ padding: 16 });
  });

  it('caches fallback results with stable identity', () => {
    const first = resolveClassNames('p-7', light);
    const second = resolveClassNames('p-7', light);
    expect(second).toBe(first);
  });

  it('skips tokens the fallback cannot parse and records them', () => {
    expect(resolveClassNames('rotate-45 p-4', light)).toEqual({ padding: 16 });
    const diagnostics = getRuntimeDiagnostics();
    expect(diagnostics.fallbackMisses).toBe(1);
    expect(diagnostics.unknownTokens).toEqual(['rotate-45']);
  });

  it('warns once per unknown token in dev builds', () => {
    (globalThis as Record<string, unknown>).__DEV__ = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      resolveClassNames('nope-xyz p-4', light);
      __clearStyleCache();
      resolveClassNames('nope-xyz p-4', light);
      const calls = warn.mock.calls.map((args) => String(args[0]));
      expect(calls.filter((message) => message.includes('WF2001'))).toHaveLength(1);
      expect(calls.some((message) => message.includes('nope-xyz'))).toBe(true);
    } finally {
      delete (globalThis as Record<string, unknown>).__DEV__;
      warn.mockRestore();
    }
  });

  it('notices the first fallback use in dev builds', () => {
    (globalThis as Record<string, unknown>).__DEV__ = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      resolveClassNames('p-7', light);
      __clearStyleCache();
      resolveClassNames('p-9', light);
      const calls = warn.mock.calls.map((args) => String(args[0]));
      expect(calls.filter((message) => message.includes('WF2002'))).toHaveLength(1);
    } finally {
      delete (globalThis as Record<string, unknown>).__DEV__;
      warn.mockRestore();
    }
  });
});

describe('composed-string cache', () => {
  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    __resetRuntimeDiagnostics();
    registerArtifact(artifact);
  });

  it('returns the same object for the same className string', () => {
    const first = resolveClassNames('p-4 bg-zinc-950', light);
    const second = resolveClassNames('p-4 bg-zinc-950', light);
    expect(second).toBe(first);
  });

  it('normalizes whitespace before keying', () => {
    const first = resolveClassNames('p-4 bg-zinc-950', light);
    const second = resolveClassNames('  p-4    bg-zinc-950 ', light);
    expect(second).toBe(first);
  });

  it('recomputes on condition change', () => {
    const lightResult = resolveClassNames('dark:text-white', light);
    const darkResult = resolveClassNames('dark:text-white', { ...light, colorScheme: 'dark' });
    expect(darkResult).not.toBe(lightResult);
    expect(darkResult).toEqual({ color: '#ffffff' });
  });

  it('recomputes when a new artifact registers', () => {
    const before = resolveClassNames('p-4', light);
    registerArtifact({
      ...artifact,
      hash: 'v2',
      styles: {
        'p-4': {
          base: [{ property: 'padding', value: { kind: 'number', value: 24 }, sourceOrder: 0 }],
        },
      },
    });
    const after = resolveClassNames('p-4', light);
    expect(after).not.toBe(before);
    expect(after).toEqual({ padding: 24 });
  });

  it('counts hits and misses', () => {
    resolveClassNames('p-4', light); // miss: 1 token resolve
    const before = getRuntimeDiagnostics();
    resolveClassNames('p-4', light); // composed hit: no token resolves
    const after = getRuntimeDiagnostics();
    expect(after.resolves).toBe(before.resolves);
    __clearStyleCache();
    resolveClassNames('p-4', light); // token cache cleared: cache miss again
    expect(getRuntimeDiagnostics().cacheMisses).toBe(before.cacheMisses + 1);
  });

  it('resets diagnostics to zero', () => {
    resolveClassNames('p-4 rotate-45', light);
    __resetRuntimeDiagnostics();
    expect(getRuntimeDiagnostics()).toEqual({
      resolves: 0,
      cacheHits: 0,
      cacheMisses: 0,
      fallbackParses: 0,
      fallbackMisses: 0,
      unknownTokens: [],
    });
  });
});

describe('resolveAnimationMeta', () => {
  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    __resetRuntimeDiagnostics();
    registerArtifact(artifact);
  });

  it('returns animation metadata for animate-* tokens', () => {
    const meta = resolveAnimationMeta('animate-spin');
    expect(meta?.animation?.name).toBe('spin');
    expect(meta?.animation?.iterationCount).toBe('infinite');
    expect(meta?.transition).toBeUndefined();
  });

  it('returns transition metadata for transition utilities', () => {
    const meta = resolveAnimationMeta('transition');
    expect(meta?.transition).toEqual({
      properties: ['color', 'backgroundColor', 'borderColor', 'opacity', 'transform'],
      timingFunction: { kind: 'cubic-bezier', points: [0.4, 0, 0.2, 1] },
      duration: { ms: 150 },
    });
  });

  it('merges composed transition tokens per field, later wins', () => {
    // duration-500's `properties: 'all'` replaces the transition list and
    // its duration, but the earlier timingFunction survives per-field.
    const meta = resolveAnimationMeta('transition duration-500');
    expect(meta?.transition).toEqual({
      properties: 'all',
      timingFunction: { kind: 'cubic-bezier', points: [0.4, 0, 0.2, 1] },
      duration: { ms: 500 },
    });
  });

  it('carries both animation and transition metadata', () => {
    const meta = resolveAnimationMeta('animate-spin ease-in-out p-4');
    expect(meta?.animation?.name).toBe('spin');
    expect(meta?.transition?.timingFunction).toEqual({
      kind: 'cubic-bezier',
      points: [0.4, 0, 0.2, 1],
    });
  });

  it('returns null for tokens without animation metadata', () => {
    expect(resolveAnimationMeta('p-4 bg-zinc-950')).toBeNull();
    expect(resolveAnimationMeta('')).toBeNull();
    // Fallback-only tokens (p-7 parses at runtime) carry no meta.
    expect(resolveAnimationMeta('p-7')).toBeNull();
    expect(resolveAnimationMeta('nope-xyz')).toBeNull();
  });

  it('caches with stable identity, including nulls', () => {
    expect(resolveAnimationMeta('animate-spin')).toBe(resolveAnimationMeta('animate-spin'));
    expect(resolveAnimationMeta('p-4')).toBe(resolveAnimationMeta('p-4'));
  });

  it('recomputes when a new artifact registers', () => {
    expect(resolveAnimationMeta('animate-spin')?.animation?.name).toBe('spin');
    registerArtifact({
      ...artifact,
      hash: 'v2',
      styles: {
        'animate-spin': {
          base: [],
          animation: {
            name: 'spin-v2',
            keyframes: [],
            duration: { ms: 500 },
          },
        },
      },
    });
    expect(resolveAnimationMeta('animate-spin')?.animation?.name).toBe('spin-v2');
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

  it('returns the raw ref for non-variable token references', () => {
    // Phase 12: only dashed-ident tokens (--name) enter the variable cascade.
    // Legacy category-prefixed refs (colors.primary) pass through as-is.
    expect(toReactNativeValue({ kind: 'token', ref: 'colors.primary' })).toBe('colors.primary');
  });

  it('throws on unresolved variable references', () => {
    expect(() => toReactNativeValue({ kind: 'variable', name: '--missing' })).toThrow();
  });
});
