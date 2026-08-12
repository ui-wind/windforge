import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetBackend, getBackend, selectBackend } from '../src/backends/index.js';
import { createFabricBackend, setFabricNativeAdapter, type NativeStyleAdapter } from '../src/backends/fabric.js';
import { createJsBaselineBackend } from '../src/backends/js-baseline.js';
import { __resetRegistry, registerArtifact } from '../src/registry.js';
import { __clearStyleCache, resolveClassNames } from '../src/resolve.js';
import type { ConditionState } from '../src/state.js';
import type { RuntimeArtifact } from '../src/types.js';

const light: ConditionState = {
  colorScheme: 'light',
  platform: 'ios',
  windowWidth: 390,
  windowHeight: 844,
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

    const register = calls.find((c) => c.method === 'registerStyles');
    expect(register).toBeDefined();
    expect(register?.args[0]).toEqual({
      'p-4': { padding: 16 },
      'bg-zinc-950': { backgroundColor: '#09090b' },
    });
    expect(calls).toContainEqual({ method: 'link', args: [101, 'p-4 bg-zinc-950'] });
  });

  it('pushes only changed classNames when conditions change', () => {
    const { adapter } = createMockAdapter();
    setFabricNativeAdapter(adapter);
    const backend = createFabricBackend();

    backend.resolveStyle('p-4 bg-zinc-950', light);
    backend.link?.(101, 'p-4 bg-zinc-950', light);

    backend.onConditionsChanged?.(dark, light);
    // p-4 is condition-independent; only bg-zinc-950 flips.
    expect(adapter.updateStyles).toHaveBeenCalledTimes(1);
    expect(adapter.updateStyles).toHaveBeenCalledWith({
      'bg-zinc-950': { backgroundColor: '#fafafa' },
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
    // One real change (bg-zinc-950 is not even known), zero pushes.
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
});
