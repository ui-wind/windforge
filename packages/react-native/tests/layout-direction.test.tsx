/**
 * Phase 15 — LayoutDirection subtree override tests (parity with the
 * Uniwind Pro 1.4.0 LayoutDirection component).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The real react-native entry is Flow-typed and cannot be parsed by vitest;
// string host components let react-test-renderer inspect final props.
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  Pressable: 'Pressable',
  TextInput: 'TextInput',
  ScrollView: 'ScrollView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
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

import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { __resetBackend } from '../src/backends/index.js';
import { View } from '../src/components.js';
import {
  LayoutDirection,
  useLayoutDirection,
} from '../src/layout-direction.js';
import { useWindforgeStyle } from '../src/prop-mapping/useWindforgeStyle.js';
import { __resetRegistry, registerArtifact } from '../src/registry.js';
import { __clearStyleCache } from '../src/resolve.js';
import type { RuntimeArtifact } from '../src/types.js';

const artifact: RuntimeArtifact = {
  version: 1,
  irVersion: 1,
  hash: 'phase15-layout',
  styles: {
    'rtl:p-4': {
      base: [],
      variants: [
        {
          conditionIds: ['layout-direction:rtl'],
          declarations: [
            { property: 'padding', value: { kind: 'number', value: 16 }, sourceOrder: 0 },
          ],
        },
      ],
    },
    'ltr:p-2': {
      base: [],
      variants: [
        {
          conditionIds: ['layout-direction:ltr'],
          declarations: [
            { property: 'padding', value: { kind: 'number', value: 8 }, sourceOrder: 1 },
          ],
        },
      ],
    },
  },
  conditions: [
    { kind: 'layout-direction', id: 'layout-direction:rtl', direction: 'rtl' },
    { kind: 'layout-direction', id: 'layout-direction:ltr', direction: 'ltr' },
  ],
};

beforeEach(() => {
  __resetRegistry();
  __clearStyleCache();
  __resetBackend();
  registerArtifact(artifact);
});

describe('LayoutDirection subtree override', () => {
  it('uses the device direction without a provider', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(View, { className: 'rtl:p-4 ltr:p-2' }));
    });
    const host = renderer.root.findByType('View' as never);
    expect(host.props.style).toEqual({ padding: 8 });
  });

  it('flips rtl:/ltr: variants inside a rtl subtree', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(
          LayoutDirection,
          { direction: 'rtl' },
          createElement(View, { className: 'rtl:p-4 ltr:p-2' }),
        ),
      );
    });
    const host = renderer.root.findByType('View' as never);
    expect(host.props.style).toEqual({ padding: 16 });
  });

  it('nearest provider wins when nested', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(
          LayoutDirection,
          { direction: 'rtl' },
          createElement(
            LayoutDirection,
            { direction: 'ltr' },
            createElement(View, { className: 'rtl:p-4 ltr:p-2' }),
          ),
        ),
      );
    });
    const host = renderer.root.findByType('View' as never);
    expect(host.props.style).toEqual({ padding: 8 });
  });

  it('does not affect siblings outside the provider', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(
          'Host',
          {},
          createElement(
            LayoutDirection,
            { direction: 'rtl' },
            createElement(View, { className: 'rtl:p-4 ltr:p-2' }),
          ),
          createElement(View, { className: 'rtl:p-4 ltr:p-2' }),
        ),
      );
    });
    // Exactly the two styled Views render string 'View' hosts.
    const styled = renderer.root.findAllByType('View' as never);
    expect(styled).toHaveLength(2);
    expect(styled[0]?.props.style).toEqual({ padding: 16 });
    expect(styled[1]?.props.style).toEqual({ padding: 8 });
  });
});

describe('useLayoutDirection', () => {
  it('returns the device direction outside a provider', () => {
    const seen: string[] = [];
    function Probe() {
      seen.push(useLayoutDirection());
      return null;
    }
    act(() => {
      create(createElement(Probe));
    });
    expect(seen[0]).toBe('ltr');
  });

  it('returns the override inside a provider', () => {
    const seen: string[] = [];
    function Probe() {
      seen.push(useLayoutDirection());
      return null;
    }
    act(() => {
      create(createElement(LayoutDirection, { direction: 'rtl' }, createElement(Probe)));
    });
    expect(seen[0]).toBe('rtl');
  });
});

describe('useWindforgeStyle with LayoutDirection', () => {
  it('resolves direction variants through the hook', () => {
    const seen: unknown[] = [];
    function Consumer() {
      seen.push(useWindforgeStyle('rtl:p-4 ltr:p-2'));
      return null;
    }
    act(() => {
      create(createElement(LayoutDirection, { direction: 'rtl' }, createElement(Consumer)));
    });
    expect(seen[0]).toEqual({ padding: 16 });
  });
});
