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
import { ScrollView } from 'react-native';
import { act, create } from 'react-test-renderer';
import { __resetBackend } from '../src/backends/index.js';
import { WindforgeProvider } from '../src/provider.js';
import {
  __resetComponentRegistry,
  registerComponent,
} from '../src/prop-mapping/registry.js';
import { styled } from '../src/prop-mapping/styled.js';
import { useWindforgeStyle } from '../src/prop-mapping/useWindforgeStyle.js';
import { withWindforge } from '../src/prop-mapping/withWindforge.js';
import { useResolveClassNames } from '../src/prop-mapping/useResolveClassNames.js';
import { __resetRegistry, registerArtifact } from '../src/registry.js';
import { __clearStyleCache } from '../src/resolve.js';
import type { RuntimeArtifact } from '../src/types.js';

const artifact: RuntimeArtifact = {
  version: 1,
  irVersion: 1,
  hash: 'test',
  styles: {
    'p-4': {
      base: [{ property: 'padding', value: { kind: 'number', value: 16 }, sourceOrder: 0 }],
    },
    'gap-2': {
      base: [{ property: 'gap', value: { kind: 'number', value: 8 }, sourceOrder: 0 }],
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
  },
  conditions: [{ kind: 'color-scheme', id: 'color-scheme:dark', scheme: 'dark' }],
};

function CustomHost(props: { style?: unknown; cardStyle?: unknown; className?: string }) {
  return createElement('CustomHost', props);
}

describe('styled()', () => {
  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    __resetBackend();
    __resetComponentRegistry();
    registerArtifact(artifact);
  });

  it('resolves the default className → style mapping', () => {
    const Styled = styled(CustomHost);
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(Styled, { className: 'p-4' }));
    });
    const host = renderer.root.findByType('CustomHost' as never);
    expect(host.props.style).toEqual({ padding: 16 });
    // className is a Windforge-only prop and never reaches the host.
    expect(host.props.className).toBeUndefined();
  });

  it('uses the registry mapping for known components', () => {
    const Styled = styled(ScrollView);
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(Styled, { className: 'p-4', contentContainerClassName: 'gap-2' }),
      );
    });
    const host = renderer.root.findByType('ScrollView' as never);
    expect(host.props.style).toEqual({ padding: 16 });
    expect(host.props.contentContainerStyle).toEqual({ gap: 8 });
  });

  it('applies custom mappings registered via registerComponent', () => {
    registerComponent({
      component: CustomHost,
      classNameProp: 'cardClassName',
      styleProp: 'cardStyle',
    });
    const Styled = styled(CustomHost);
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(Styled, { className: 'p-4', cardClassName: 'gap-2' }),
      );
    });
    const host = renderer.root.findByType('CustomHost' as never);
    // className is not part of the registered mapping — left untouched.
    expect(host.props.style).toBeUndefined();
    expect(host.props.cardStyle).toEqual({ gap: 8 });
  });

  it('prefers explicit mappings over the registry', () => {
    registerComponent({
      component: CustomHost,
      classNameProp: 'cardClassName',
      styleProp: 'cardStyle',
    });
    const Styled = styled(CustomHost, [
      { classNameProp: 'className', styleProp: 'style' },
    ]);
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(Styled, { className: 'p-4' }));
    });
    const host = renderer.root.findByType('CustomHost' as never);
    expect(host.props.style).toEqual({ padding: 16 });
  });

  it('keeps the style prop as the escape hatch (user style wins)', () => {
    const Styled = styled(CustomHost);
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(Styled, { className: 'p-4', style: { padding: 2 } }),
      );
    });
    const host = renderer.root.findByType('CustomHost' as never);
    expect(host.props.style).toEqual([{ padding: 16 }, { padding: 2 }]);
  });
});

describe('useWindforgeStyle', () => {
  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    __resetBackend();
    registerArtifact(artifact);
  });

  it('returns the resolved style and a stable empty object for no input', () => {
    const seen: unknown[] = [];
    function Consumer(props: { className?: string }) {
      seen.push(useWindforgeStyle(props.className));
      return null;
    }
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(Consumer, { className: 'p-4 gap-2' }));
    });
    expect(seen[0]).toEqual({ padding: 16, gap: 8 });
    act(() => {
      renderer.update(createElement(Consumer, {}));
    });
    const emptyFirst = seen[1];
    act(() => {
      renderer.update(createElement(Consumer, {}));
    });
    expect(seen[2]).toBe(emptyFirst);
    expect(emptyFirst).toEqual({});
  });

  it('re-resolves when conditions change through the provider', () => {
    const seen: unknown[] = [];
    function Consumer() {
      seen.push(useWindforgeStyle('dark:text-white'));
      return null;
    }
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(WindforgeProvider, { colorScheme: 'light' }, createElement(Consumer)),
      );
    });
    expect(seen.at(-1)).toEqual({ color: '#999999' });
    act(() => {
      renderer.update(
        createElement(WindforgeProvider, { colorScheme: 'dark' }, createElement(Consumer)),
      );
    });
    expect(seen.at(-1)).toEqual({ color: '#ffffff' });
  });
});

describe('withWindforge (HOC alias of styled)', () => {
  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    __resetBackend();
    __resetComponentRegistry();
    registerArtifact(artifact);
  });

  it('resolves className → style exactly like styled()', () => {
    const Wrapped = withWindforge(CustomHost);
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(Wrapped, { className: 'p-4 gap-2' }));
    });
    const host = renderer.root.findByType('CustomHost' as never);
    expect(host.props.style).toEqual({ padding: 16, gap: 8 });
    expect(host.props.className).toBeUndefined();
  });

  it('accepts explicit prop mappings like styled()', () => {
    const Wrapped = withWindforge(CustomHost, [
      { classNameProp: 'cardClassName', styleProp: 'cardStyle' },
    ]);
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(Wrapped, { cardClassName: 'gap-2' }));
    });
    const host = renderer.root.findByType('CustomHost' as never);
    expect(host.props.cardStyle).toEqual({ gap: 8 });
  });
});

describe('useResolveClassNames (alias of useWindforgeStyle)', () => {
  beforeEach(() => {
    __resetRegistry();
    __clearStyleCache();
    __resetBackend();
    registerArtifact(artifact);
  });

  it('resolves a className string to a style object', () => {
    const seen: unknown[] = [];
    function Consumer() {
      seen.push(useResolveClassNames('p-4 gap-2'));
      return null;
    }
    act(() => {
      create(createElement(Consumer));
    });
    expect(seen[0]).toEqual({ padding: 16, gap: 8 });
  });
});
