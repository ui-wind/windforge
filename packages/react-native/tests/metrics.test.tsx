import { beforeEach, describe, expect, it, vi } from 'vitest';

// Tell React this is an act() environment (silences the warning emitted by
// react-test-renderer in a vitest node context).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Controllable insets source for the mocked safe-area-context module.
let mockInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// The real react-native entry is Flow-typed and cannot be parsed by vitest;
// string host components let react-test-renderer inspect final props.
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  findNodeHandle: () => null,
  processColor: (color: string) => color,
  Appearance: {
    getColorScheme: () => 'light',
    addChangeListener: () => ({ remove() {} }),
  },
  Dimensions: {
    get: () => ({ width: 390, height: 844 }),
    addEventListener: () => ({ remove() {} }),
  },
  PixelRatio: { get: () => 3, getFontScale: () => 1 },
  I18nManager: { getConstants: () => ({ isRTL: false }) },
  Platform: { OS: 'ios' },
}));

vi.mock('react-native-safe-area-context', async () => {
  const { createElement } = await import('react');
  return {
    SafeAreaProvider: ({ children }: { children: unknown }) =>
      createElement('SafeAreaProvider', null, children),
    useSafeAreaInsets: () => mockInsets,
  };
});

import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import {
  __resetInsets,
  getInsets,
  getMetrics,
  setInsets,
  subscribeInsets,
  useInsets,
  useMetrics,
} from '../src/metrics.js';
import { getConditions } from '../src/provider.js';
import { __resetRegistry, registerArtifact } from '../src/registry.js';
import { __clearStyleCache, resolveClassNames } from '../src/resolve.js';
import { WindforgeSafeAreaProvider } from '../src/safe-area.js';
import { stateSignature, type ConditionState } from '../src/state.js';
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

describe('stateSignature', () => {
  it('includes font scale, pixel ratio and layout direction', () => {
    expect(stateSignature(baseState)).toBe('light|ios|390x844|f1|p3|dltr|tlight');
  });

  it('differs when any metric changes', () => {
    const signature = stateSignature(baseState);
    expect(stateSignature({ ...baseState, fontScale: 1.5 })).not.toBe(signature);
    expect(stateSignature({ ...baseState, pixelRatio: 2 })).not.toBe(signature);
    expect(stateSignature({ ...baseState, layoutDirection: 'rtl' })).not.toBe(signature);
  });
});

describe('condition store metrics', () => {
  it('seeds platform metrics from RN at module load', () => {
    expect(getConditions()).toMatchObject({
      fontScale: 1,
      pixelRatio: 3,
      layoutDirection: 'ltr',
    });
  });
});

describe('insets store', () => {
  beforeEach(() => {
    __resetInsets();
    mockInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  });

  it('starts null and publishes on change', () => {
    expect(getInsets()).toBeNull();
    let notified = 0;
    const unsubscribe = subscribeInsets(() => {
      notified += 1;
    });
    setInsets({ top: 59, right: 0, bottom: 34, left: 0 });
    expect(getInsets()).toEqual({ top: 59, right: 0, bottom: 34, left: 0 });
    expect(notified).toBe(1);
    // Identical insets are a noop — no duplicate notifications.
    setInsets({ top: 59, right: 0, bottom: 34, left: 0 });
    expect(notified).toBe(1);
    unsubscribe();
    setInsets({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(notified).toBe(1);
  });

  it('merges conditions and insets in getMetrics', () => {
    setInsets({ top: 59, right: 0, bottom: 34, left: 0 });
    const metrics = getMetrics();
    expect(metrics.insets).toEqual({ top: 59, right: 0, bottom: 34, left: 0 });
    expect(metrics.colorScheme).toBe('light');
    expect(metrics.fontScale).toBe(1);
    expect(metrics.layoutDirection).toBe('ltr');
  });
});

describe('useMetrics / useInsets', () => {
  beforeEach(() => {
    __resetInsets();
  });

  it('re-renders when insets change', () => {
    const seen: ReturnType<typeof useMetrics>[] = [];
    function Consumer() {
      seen.push(useMetrics());
      return null;
    }
    act(() => {
      create(createElement(Consumer));
    });
    expect(seen.at(-1)?.insets).toBeNull();
    act(() => {
      setInsets({ top: 10, right: 0, bottom: 20, left: 0 });
    });
    expect(seen.at(-1)?.insets).toEqual({ top: 10, right: 0, bottom: 20, left: 0 });
  });

  it('subscribe=false reads the snapshot without subscribing', () => {
    const seen: (ReturnType<typeof useInsets> | undefined)[] = [];
    function Consumer() {
      seen.push(useInsets(false));
      return null;
    }
    act(() => {
      create(createElement(Consumer));
    });
    expect(seen).toHaveLength(1);
    act(() => {
      setInsets({ top: 1, right: 2, bottom: 3, left: 4 });
    });
    expect(seen).toHaveLength(1);
  });
});

describe('WindforgeSafeAreaProvider', () => {
  beforeEach(() => {
    __resetInsets();
  });

  it('publishes safe-area-context insets into the metrics store', () => {
    mockInsets = { top: 59, right: 0, bottom: 34, left: 0 };
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(WindforgeSafeAreaProvider, null, createElement('Child')),
      );
    });
    expect(getInsets()).toEqual({ top: 59, right: 0, bottom: 34, left: 0 });
    // Inset changes (rotation, split view) propagate through the bridge.
    mockInsets = { top: 0, right: 59, bottom: 21, left: 0 };
    act(() => {
      renderer.update(
        createElement(WindforgeSafeAreaProvider, null, createElement('Child')),
      );
    });
    expect(getInsets()).toEqual({ top: 0, right: 59, bottom: 21, left: 0 });
  });
});

describe('style cache regression', () => {
  const artifact: RuntimeArtifact = {
    version: 1,
    irVersion: 1,
    hash: 'metrics-cache',
    styles: {
      'p-4': {
        base: [{ property: 'padding', value: { kind: 'number', value: 16 }, sourceOrder: 0 }],
      },
    },
    conditions: [],
  };

  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    registerArtifact(artifact);
  });

  it('keys the style cache per metric signature', () => {
    const fontScale1 = resolveClassNames('p-4', baseState);
    const fontScale15 = resolveClassNames('p-4', { ...baseState, fontScale: 1.5 });
    expect(fontScale1).toEqual({ padding: 16 });
    expect(fontScale15).toEqual({ padding: 16 });
    // Different signature → separate entry, never a stale cross-hit.
    expect(fontScale15).not.toBe(fontScale1);
    expect(resolveClassNames('p-4', baseState)).toBe(fontScale1);
  });
});
