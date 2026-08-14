import { beforeEach, describe, expect, it, vi } from 'vitest';

// Tell React this is an act() environment (silences the warning emitted by
// react-test-renderer in a vitest node context).
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
import { Pressable, Text, TextInput } from '../src/components.js';
import { styled } from '../src/prop-mapping/styled.js';
import { useWindforgeStyle } from '../src/prop-mapping/useWindforgeStyle.js';
import { __resetRegistry, registerArtifact } from '../src/registry.js';
import { __clearStyleCache } from '../src/resolve.js';
import type { RuntimeArtifact } from '../src/types.js';

let sourceOrder = 0;

function decl(property: string, value: { kind: 'color'; value: string } | { kind: 'number'; value: number }) {
  return { property, value, sourceOrder: sourceOrder++ };
}

function variant(conditionIds: string[], declaration: ReturnType<typeof decl>) {
  return { conditionIds, declarations: [declaration] };
}

const artifact: RuntimeArtifact = {
  version: 1,
  irVersion: 1,
  hash: 'test',
  styles: {
    'p-4': { base: [decl('padding', { kind: 'number', value: 16 })] },
    'bg-zinc-800': {
      base: [decl('backgroundColor', { kind: 'color', value: '#27272a' })],
    },
    'active:bg-red-500': {
      base: [],
      variants: [variant(['state:active'], decl('backgroundColor', { kind: 'color', value: '#ef4444' }))],
    },
    'hover:bg-emerald-500': {
      base: [],
      variants: [variant(['state:hover'], decl('backgroundColor', { kind: 'color', value: '#10b981' }))],
    },
    'focus:bg-amber-500': {
      base: [],
      variants: [variant(['state:focus'], decl('backgroundColor', { kind: 'color', value: '#f59e0b' }))],
    },
    'disabled:opacity-50': {
      base: [],
      variants: [variant(['state:disabled'], decl('opacity', { kind: 'number', value: 0.5 }))],
    },
    'group-active:bg-blue-500': {
      base: [],
      variants: [variant(['state:active:group'], decl('backgroundColor', { kind: 'color', value: '#3b82f6' }))],
    },
    'group-active/card:bg-blue-500': {
      base: [],
      variants: [variant(['state:active:group:card'], decl('backgroundColor', { kind: 'color', value: '#3b82f6' }))],
    },
    'data-[selected=true]:bg-emerald-500': {
      base: [],
      variants: [variant(['data:selected=true'], decl('backgroundColor', { kind: 'color', value: '#10b981' }))],
    },
    'data-[open]:bg-cyan-500': {
      base: [],
      variants: [variant(['data:open'], decl('backgroundColor', { kind: 'color', value: '#06b6d4' }))],
    },
  },
  conditions: [
    { kind: 'state', id: 'state:active', state: 'active' },
    { kind: 'state', id: 'state:hover', state: 'hover' },
    { kind: 'state', id: 'state:focus', state: 'focus' },
    { kind: 'state', id: 'state:disabled', state: 'disabled' },
    { kind: 'state', id: 'state:active:group', state: 'active', group: true },
    { kind: 'state', id: 'state:active:group:card', state: 'active', group: true, groupName: 'card' },
    { kind: 'data', id: 'data:selected=true', name: 'selected', value: 'true' },
    { kind: 'data', id: 'data:open', name: 'open' },
  ],
};

beforeEach(() => {
  __resetRegistry();
  __clearStyleCache();
  __resetBackend();
  registerArtifact(artifact);
});

describe('Pressable interaction state', () => {
  it('applies active: styles while pressed and reverts on release', () => {
    const onPressIn = vi.fn();
    const onPressOut = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(Pressable, { className: 'active:bg-red-500', onPressIn, onPressOut }),
      );
    });
    const host = renderer.root.findByType('Pressable' as never);
    expect(host.props.style).toEqual({});
    act(() => {
      host.props.onPressIn({});
    });
    expect(host.props.style).toEqual({ backgroundColor: '#ef4444' });
    expect(onPressIn).toHaveBeenCalledTimes(1);
    act(() => {
      host.props.onPressOut({});
    });
    expect(host.props.style).toEqual({});
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it('applies hover: styles from hover events', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(Pressable, { className: 'hover:bg-emerald-500' }));
    });
    const host = renderer.root.findByType('Pressable' as never);
    act(() => {
      host.props.onHoverIn({});
    });
    expect(host.props.style).toEqual({ backgroundColor: '#10b981' });
    act(() => {
      host.props.onHoverOut({});
    });
    expect(host.props.style).toEqual({});
  });

  it('applies disabled: styles from the disabled prop', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(Pressable, { className: 'disabled:opacity-50', disabled: true }),
      );
    });
    const host = renderer.root.findByType('Pressable' as never);
    expect(host.props.style).toEqual({ opacity: 0.5 });
    expect(host.props.disabled).toBe(true);
  });

  it('feeds data-* props to data conditions and strips them from the host', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(Pressable, {
          className: 'data-[open]:bg-cyan-500 p-4',
          'data-open': true,
        }),
      );
    });
    const host = renderer.root.findByType('Pressable' as never);
    expect(host.props.style).toEqual({ backgroundColor: '#06b6d4', padding: 16 });
    expect(host.props['data-open']).toBeUndefined();
    expect(host.props.className).toBeUndefined();
  });

  it('keeps the style prop as the escape hatch (user style wins)', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(Pressable, {
          className: 'active:bg-red-500',
          style: { backgroundColor: '#000000' },
        }),
      );
    });
    const host = renderer.root.findByType('Pressable' as never);
    act(() => {
      host.props.onPressIn({});
    });
    expect(host.props.style).toEqual([{ backgroundColor: '#ef4444' }, { backgroundColor: '#000000' }]);
  });
});

describe('TextInput interaction state', () => {
  it('applies focus: styles between focus and blur', () => {
    const onFocus = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(TextInput, { className: 'focus:bg-amber-500', onFocus }));
    });
    const host = renderer.root.findByType('TextInput' as never);
    expect(host.props.style).toEqual({});
    act(() => {
      host.props.onFocus({});
    });
    expect(host.props.style).toEqual({ backgroundColor: '#f59e0b' });
    expect(onFocus).toHaveBeenCalledTimes(1);
    act(() => {
      host.props.onBlur({});
    });
    expect(host.props.style).toEqual({});
  });

  it('treats editable={false} as disabled', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(TextInput, { className: 'disabled:opacity-50', editable: false }),
      );
    });
    const host = renderer.root.findByType('TextInput' as never);
    expect(host.props.style).toEqual({ opacity: 0.5 });
    expect(host.props.editable).toBe(false);
  });
});

describe('group propagation', () => {
  it('publishes anonymous group state to styled descendants', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(
          Pressable,
          { className: 'group p-4' },
          createElement(Text, { className: 'group-active:bg-blue-500' }),
        ),
      );
    });
    const text = renderer.root.findByType('Text' as never);
    expect(text.props.style).toEqual({});
    const pressable = renderer.root.findByType('Pressable' as never);
    act(() => {
      pressable.props.onPressIn({});
    });
    expect(renderer.root.findByType('Text' as never).props.style).toEqual({
      backgroundColor: '#3b82f6',
    });
    act(() => {
      pressable.props.onPressOut({});
    });
    expect(renderer.root.findByType('Text' as never).props.style).toEqual({});
  });

  it('group variant beats a conflicting base utility regardless of token order', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(
          Pressable,
          { className: 'group p-4' },
          // Variant listed BEFORE the conflicting base utility — in CSS the
          // conditional selector outranks the plain utility either way.
          createElement(Text, { className: 'group-active:bg-blue-500 bg-zinc-800' }),
        ),
      );
    });
    const pressable = renderer.root.findByType('Pressable' as never);
    expect(renderer.root.findByType('Text' as never).props.style).toEqual({
      backgroundColor: '#27272a',
    });
    act(() => {
      pressable.props.onPressIn({});
    });
    expect(renderer.root.findByType('Text' as never).props.style).toEqual({
      backgroundColor: '#3b82f6',
    });
    act(() => {
      pressable.props.onPressOut({});
    });
    expect(renderer.root.findByType('Text' as never).props.style).toEqual({
      backgroundColor: '#27272a',
    });
  });

  it('scopes named groups: markers and variants must match', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(
          Pressable,
          { className: 'group/card p-4' },
          createElement(Text, { className: 'group-active/card:bg-blue-500' }),
          createElement(Text, { className: 'group-active:bg-blue-500' }),
        ),
      );
    });
    const texts = renderer.root.findAllByType('Text' as never);
    const pressable = renderer.root.findByType('Pressable' as never);
    act(() => {
      pressable.props.onPressIn({});
    });
    const after = renderer.root.findAllByType('Text' as never);
    // Named variant matches the `group/card` provider …
    expect(after[0]?.props.style).toEqual({ backgroundColor: '#3b82f6' });
    // … while the anonymous variant sees no anonymous group.
    expect(after[1]?.props.style).toEqual({});
    expect(texts).toHaveLength(2);
  });

  it('nearest provider wins for the same group name', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(
          Pressable,
          { className: 'group', testID: 'outer' },
          createElement(
            Pressable,
            { className: 'group', testID: 'inner' },
            createElement(Text, { className: 'group-active:bg-blue-500' }),
          ),
        ),
      );
    });
    const hosts = renderer.root.findAllByType('Pressable' as never);
    const outer = hosts.find((host) => host.props.testID === 'outer');
    const inner = hosts.find((host) => host.props.testID === 'inner');
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();
    act(() => {
      outer!.props.onPressIn({});
    });
    // The inner (nearest) provider shadows the outer one — outer press alone
    // leaves the descendant idle.
    expect(renderer.root.findByType('Text' as never).props.style).toEqual({});
    act(() => {
      inner!.props.onPressIn({});
    });
    expect(renderer.root.findByType('Text' as never).props.style).toEqual({
      backgroundColor: '#3b82f6',
    });
  });
});

describe('data-* variants through styled()', () => {
  function CustomHost(props: { style?: unknown }) {
    return createElement('CustomHost', props);
  }

  it('activates exact-match data conditions and tracks prop changes', () => {
    const Styled = styled(CustomHost);
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(Styled, {
          className: 'data-[selected=true]:bg-emerald-500',
          'data-selected': true,
        }),
      );
    });
    const host = renderer.root.findByType('CustomHost' as never);
    expect(host.props.style).toEqual({ backgroundColor: '#10b981' });
    expect(host.props['data-selected']).toBeUndefined();
    act(() => {
      renderer.update(
        createElement(Styled, {
          className: 'data-[selected=true]:bg-emerald-500',
          'data-selected': 'false',
        }),
      );
    });
    expect(renderer.root.findByType('CustomHost' as never).props.style).toEqual({});
  });
});

describe('useWindforgeStyle with component state', () => {
  it('accepts an explicit component state', () => {
    const seen: unknown[] = [];
    function Consumer() {
      seen.push(useWindforgeStyle('active:bg-red-500', { pressed: true }));
      return null;
    }
    act(() => {
      create(createElement(Consumer));
    });
    expect(seen.at(-1)).toEqual({ backgroundColor: '#ef4444' });
  });

  it('consumes ancestor group state automatically', () => {
    const seen: unknown[] = [];
    function Consumer() {
      seen.push(useWindforgeStyle('group-active:bg-blue-500'));
      return null;
    }
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(Pressable, { className: 'group p-4' }, createElement(Consumer)),
      );
    });
    expect(seen.at(-1)).toEqual({});
    const pressable = renderer.root.findByType('Pressable' as never);
    act(() => {
      pressable.props.onPressIn({});
    });
    expect(seen.at(-1)).toEqual({ backgroundColor: '#3b82f6' });
  });
});
