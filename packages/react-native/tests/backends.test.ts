import { beforeEach, describe, expect, it, vi } from 'vitest';

// The fabric backend only touches `processColor`; the real react-native
// entry is Flow-typed and cannot be parsed by vitest.
vi.mock('react-native', () => ({
  processColor: (color: string) => parseInt(color.slice(1), 16),
}));
import { __resetBackend, getBackend, selectBackend } from '../src/backends/index.js';
import { createFabricBackend, setFabricNativeAdapter, type NativeStyleAdapter } from '../src/backends/fabric.js';
import { createJsBaselineBackend } from '../src/backends/js-baseline.js';
import { __resetRegistry, registerArtifact } from '../src/registry.js';
import * as resolveModule from '../src/resolve.js';
import { __clearStyleCache, resolveClassNames } from '../src/resolve.js';
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

const dark: ConditionState = { ...light, colorScheme: 'dark' };

const artifact: RuntimeArtifact = {
  version: 1,
  irVersion: 1,
  hash: 'test',
  styles: {
    'p-4': {
      base: [{ property: 'padding', value: { kind: 'number', value: 16 }, sourceOrder: 0 }],
    },
    'bg-zinc-950': {
      base: [
        { property: 'backgroundColor', value: { kind: 'color', value: '#09090b' }, sourceOrder: 0 },
      ],
      variants: [
        {
          conditionIds: ['color-scheme:dark'],
          declarations: [
            { property: 'backgroundColor', value: { kind: 'color', value: '#fafafa' }, sourceOrder: 0 },
          ],
        },
      ],
    },
  },
  conditions: [{ kind: 'color-scheme', id: 'color-scheme:dark', scheme: 'dark' }],
  dependencies: {
    'p-4': [],
    'bg-zinc-950': ['color-scheme:dark'],
  },
};

function createMockAdapter() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const adapter: NativeStyleAdapter = {
    registerStyles: vi.fn((...args) => {
      calls.push({ method: 'registerStyles', args });
    }),
    updateStyles: vi.fn((...args) => {
      calls.push({ method: 'updateStyles', args });
    }),
    link: vi.fn((...args) => {
      calls.push({ method: 'link', args });
    }),
    unlink: vi.fn((...args) => {
      calls.push({ method: 'unlink', args });
    }),
  };
  return { adapter, calls };
}

describe('backend selection', () => {
  beforeEach(() => {
    __resetBackend();
  });

  it('defaults to js-baseline without selection', () => {
    expect(getBackend().name).toBe('js-baseline');
  });

  it('selects the fabric backend explicitly', () => {
    const backend = selectBackend('fabric');
    expect(backend.name).toBe('fabric');
    expect(getBackend()).toBe(backend);
  });

  it('selectBackend(js-baseline) returns the baseline backend', () => {
    expect(selectBackend('js-baseline').name).toBe('js-baseline');
  });
});

describe('js-baseline backend', () => {
  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    registerArtifact(artifact);
  });

  it('requires context (React re-renders deliver updates)', () => {
    expect(createJsBaselineBackend().requiresContext()).toBe(true);
  });

  it('resolves exactly like resolveClassNames', () => {
    const backend = createJsBaselineBackend();
    expect(backend.resolveStyle('p-4 bg-zinc-950', light)).toEqual(
      resolveClassNames('p-4 bg-zinc-950', light),
    );
    expect(backend.resolveStyle('bg-zinc-950', dark)).toEqual(
      resolveClassNames('bg-zinc-950', dark),
    );
  });

  it('has no native delivery surface', () => {
    const backend = createJsBaselineBackend();
    expect(backend.link).toBeUndefined();
    expect(backend.unlink).toBeUndefined();
    expect(backend.onConditionsChanged).toBeUndefined();
  });
});

describe('fabric backend', () => {
  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    __resetBackend();
    setFabricNativeAdapter(null);
    registerArtifact(artifact);
  });

  it('requires context only while no native adapter is installed', () => {
    const backend = createFabricBackend();
    expect(backend.requiresContext()).toBe(true);
    setFabricNativeAdapter(createMockAdapter().adapter);
    expect(backend.requiresContext()).toBe(false);
  });

  it('registers pending styles and links on first link', () => {
    const { adapter, calls } = createMockAdapter();
    setFabricNativeAdapter(adapter);
    const backend = createFabricBackend();

    backend.resolveStyle('p-4 bg-zinc-950', light);
    backend.link?.(101, 'p-4 bg-zinc-950', light);

    // The protocol key is the whole className string, exactly as link()
    // refers to it — native never sees individual utility classes.
    const register = calls.find((c) => c.method === 'registerStyles');
    expect(register).toBeDefined();
    // Colors cross the native boundary as processed integers (the C++ props
    // parser has no string-color support); non-color values pass through.
    expect(register?.args[0]).toEqual({
      'p-4 bg-zinc-950': { padding: 16, backgroundColor: 0x09090b },
    });
    expect(calls).toContainEqual({ method: 'link', args: [101, 'p-4 bg-zinc-950'] });
    // The React style-prop path keeps raw strings (RN's own pipeline
    // processes them).
    expect(backend.resolveStyle('p-4 bg-zinc-950', light)).toEqual({
      padding: 16,
      backgroundColor: '#09090b',
    });
  });

  it('normalizes whitespace so register/link/update share one key', () => {
    const { adapter, calls } = createMockAdapter();
    setFabricNativeAdapter(adapter);
    const backend = createFabricBackend();

    backend.resolveStyle(' p-4   bg-zinc-950 ', light);
    backend.link?.(101, 'p-4\tbg-zinc-950', light);

    const register = calls.find((c) => c.method === 'registerStyles');
    expect(register?.args[0]).toHaveProperty('p-4 bg-zinc-950');
    expect(calls).toContainEqual({ method: 'link', args: [101, 'p-4 bg-zinc-950'] });
  });

  it('pushes only changed className strings when conditions change', () => {
    const { adapter } = createMockAdapter();
    setFabricNativeAdapter(adapter);
    const backend = createFabricBackend();

    // One compound string (changes because bg-zinc-950 flips) and one
    // condition-independent single class (must not be re-pushed).
    backend.resolveStyle('p-4 bg-zinc-950', light);
    backend.resolveStyle('p-4', light);
    backend.link?.(101, 'p-4 bg-zinc-950', light);
    backend.link?.(102, 'p-4', light);

    backend.onConditionsChanged?.(dark, light);
    expect(adapter.updateStyles).toHaveBeenCalledTimes(1);
    expect(adapter.updateStyles).toHaveBeenCalledWith({
      'p-4 bg-zinc-950': { padding: 16, backgroundColor: 0xfafafa },
    });
  });

  it('does not push when nothing changed', () => {
    const { adapter } = createMockAdapter();
    setFabricNativeAdapter(adapter);
    const backend = createFabricBackend();

    backend.resolveStyle('p-4', light);
    backend.link?.(101, 'p-4', light);

    backend.onConditionsChanged?.(light, light);
    backend.onConditionsChanged?.(dark, light);
    backend.onConditionsChanged?.(dark, light);
    // No known string depends on color-scheme; zero pushes.
    expect(adapter.updateStyles).not.toHaveBeenCalled();
  });

  it('unlinks through the adapter', () => {
    const { adapter } = createMockAdapter();
    setFabricNativeAdapter(adapter);
    const backend = createFabricBackend();

    backend.resolveStyle('p-4', light);
    backend.link?.(101, 'p-4', light);
    backend.unlink?.(101);
    expect(adapter.unlink).toHaveBeenCalledWith(101);
  });

  describe('runtime fallback', () => {
    it('delivers fallback-resolved classes through the same protocol key', () => {
      const { adapter, calls } = createMockAdapter();
      setFabricNativeAdapter(adapter);
      const backend = createFabricBackend();

      // p-9 is not in the artifact; the controlled fallback parser resolves
      // it (9 × 4 = 36) and the merged string crosses the native boundary
      // as one key, exactly like artifact-only strings do.
      backend.resolveStyle('p-4 p-9', light);
      backend.link?.(201, 'p-4 p-9', light);

      const register = calls.find((c) => c.method === 'registerStyles');
      expect(register?.args[0]).toEqual({ 'p-4 p-9': { padding: 36 } });
      expect(calls).toContainEqual({ method: 'link', args: [201, 'p-4 p-9'] });
    });

    it('does not re-push fallback-containing strings when conditions change', () => {
      const { adapter } = createMockAdapter();
      setFabricNativeAdapter(adapter);
      const backend = createFabricBackend();

      backend.resolveStyle('p-4 p-9', light);
      backend.link?.(201, 'p-4 p-9', light);

      // Fallback tokens carry no dependencies entry, so the prefilter skips
      // the string entirely on a color-scheme flip — its output is static
      // base-only and cannot change.
      backend.onConditionsChanged?.(dark, light);
      expect(adapter.updateStyles).not.toHaveBeenCalled();
    });
  });

  it('degrades gracefully without a native adapter', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backend = createFabricBackend();

    backend.resolveStyle('p-4', light);
    backend.link?.(101, 'p-4', light);
    backend.onConditionsChanged?.(dark, light);
    backend.unlink?.(101);

    // No throw, resolution still works through JS.
    expect(backend.resolveStyle('p-4', dark)).toEqual({ padding: 16 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  describe('dependency prefilter', () => {
    it('skips className strings whose classes did not flip', () => {
      const { adapter } = createMockAdapter();
      setFabricNativeAdapter(adapter);
      const backend = createFabricBackend();
      const resolveSpy = vi.spyOn(resolveModule, 'resolveClassNames');

      backend.resolveStyle('p-4 bg-zinc-950', light);
      backend.resolveStyle('p-4', light);
      backend.link?.(101, 'p-4 bg-zinc-950', light);
      backend.link?.(102, 'p-4', light);
      resolveSpy.mockClear();

      // Only color-scheme:dark changed; the bare p-4 string must not even
      // be re-resolved.
      backend.onConditionsChanged?.(dark, light);
      expect(adapter.updateStyles).toHaveBeenCalledWith({
        'p-4 bg-zinc-950': { padding: 16, backgroundColor: 0xfafafa },
      });
      const resolved = resolveSpy.mock.calls.map((call) => call[0]);
      expect(resolved).toEqual(['p-4 bg-zinc-950']);
      resolveSpy.mockRestore();
    });

    it('re-resolves every known string when the artifact has no dependencies', () => {
      __resetRegistry();
      const legacy: RuntimeArtifact = {
        ...artifact,
        hash: 'legacy',
      };
      delete legacy.dependencies;
      registerArtifact(legacy);

      const { adapter } = createMockAdapter();
      setFabricNativeAdapter(adapter);
      const backend = createFabricBackend();
      const resolveSpy = vi.spyOn(resolveModule, 'resolveClassNames');

      backend.resolveStyle('p-4 bg-zinc-950', light);
      backend.resolveStyle('p-4', light);
      backend.link?.(101, 'p-4 bg-zinc-950', light);
      backend.link?.(102, 'p-4', light);
      resolveSpy.mockClear();

      backend.onConditionsChanged?.(dark, light);
      const resolved = resolveSpy.mock.calls.map((call) => call[0]);
      expect(resolved.sort()).toEqual(['p-4', 'p-4 bg-zinc-950']);
      // Result is still correct: only the changed string is pushed.
      expect(adapter.updateStyles).toHaveBeenCalledWith({
        'p-4 bg-zinc-950': { padding: 16, backgroundColor: 0xfafafa },
      });
      resolveSpy.mockRestore();
    });
  });
});
