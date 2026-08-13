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
  Platform: { OS: 'ios' },
}));

// Minimal non-worklet stand-in: component tests only check style array shape
// and subscribe wiring — animation behavior is verified on the simulator
// (mocking worklet execution under vitest is unreliable by design).
vi.mock('react-native-reanimated', () => ({
  default: {
    View: 'AnimatedView',
    Text: 'AnimatedText',
    Image: 'AnimatedImage',
    createAnimatedComponent: (component: unknown) => component,
  },
  Easing: {
    linear: 'linear',
    bezier: (...points: number[]) => ({ bezier: points }),
    steps: (steps: number, roundToNextStep?: boolean) => ({ steps, roundToNextStep }),
  },
  makeMutable: (value: unknown) => ({ value }),
  useAnimatedStyle: (updater: () => unknown) => updater(),
  withTiming: (value: unknown) => ({ withTiming: value }),
  withDelay: (_delayMs: number, animation: unknown) => animation,
  withRepeat: (animation: unknown) => animation,
  withSequence: (...animations: unknown[]) => animations.at(-1),
}));

import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import {
  WindforgeProvider,
  __resetBackend,
  __resetRegistry,
  registerArtifact,
  type RuntimeArtifact,
} from '@windforge/react-native';
import { AnimatedText, AnimatedView } from '../src/components.js';

const artifact: RuntimeArtifact = {
  version: 1,
  irVersion: 1,
  hash: 'anim-test',
  styles: {
    'p-4': {
      base: [{ property: 'padding', value: { kind: 'number', value: 16 }, sourceOrder: 0 }],
    },
    'dark:bg-black': {
      base: [],
      variants: [
        {
          conditionIds: ['color-scheme:dark'],
          declarations: [
            {
              property: 'backgroundColor',
              value: { kind: 'color', value: '#000000' },
              sourceOrder: 0,
            },
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
  },
  conditions: [{ kind: 'color-scheme', id: 'color-scheme:dark', scheme: 'dark' }],
};

describe('animated styled primitives', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetBackend();
    registerArtifact(artifact);
  });

  it('composes [resolved, animatedStyle] — never a merged object', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(AnimatedView, { className: 'p-4' }));
    });
    const host = renderer.root.findByType('AnimatedView' as never);
    const style = host.props.style as unknown[];
    expect(Array.isArray(style)).toBe(true);
    expect(style[0]).toEqual({ padding: 16 });
    // No animation metadata → the animated style contributes nothing.
    expect(style[1]).toEqual({});
    expect(style).toHaveLength(2);
    // className is a Windforge-only prop and never reaches the host.
    expect(host.props.className).toBeUndefined();
  });

  it('keeps the user style prop as the escape hatch (last entry wins)', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(AnimatedView, { className: 'p-4', style: { opacity: 0.25 } }),
      );
    });
    const host = renderer.root.findByType('AnimatedView' as never);
    const style = host.props.style as unknown[];
    expect(style).toHaveLength(3);
    expect(style[2]).toEqual({ opacity: 0.25 });
  });

  it('re-renders on condition flips (animated components always subscribe)', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        createElement(
          WindforgeProvider,
          { colorScheme: 'light' },
          createElement(AnimatedView, { className: 'dark:bg-black' }),
        ),
      );
    });
    const hostOf = () =>
      (renderer.root.findByType('AnimatedView' as never).props.style as unknown[])[0];
    expect(hostOf()).toEqual({});
    act(() => {
      renderer.update(
        createElement(
          WindforgeProvider,
          { colorScheme: 'dark' },
          createElement(AnimatedView, { className: 'dark:bg-black' }),
        ),
      );
    });
    expect(hostOf()).toEqual({ backgroundColor: '#000000' });
  });

  it('mounts animate-* keyframes without touching the style array shape', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(AnimatedView, { className: 'animate-spin' }));
    });
    const host = renderer.root.findByType('AnimatedView' as never);
    const style = host.props.style as unknown[];
    expect(style).toHaveLength(2);
    expect(style[0]).toEqual({});
  });

  it('wraps every primitive host', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(AnimatedText, { className: 'p-4' }));
    });
    const host = renderer.root.findByType('AnimatedText' as never);
    expect((host.props.style as unknown[])[0]).toEqual({ padding: 16 });
  });
});
