import { beforeEach, describe, expect, it, vi } from 'vitest';

// Tell React this is an act() environment (silences the warning emitted by
// react-test-renderer in a vitest node context).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Reduced-motion flag read by the hook at mount.
let mockReduceMotion = false;
// withTiming marker log: hook behavior is verified through the markers the
// SharedValue receives (real timing runs on the UI thread, simulator only).
const mockWithTimingCalls: Array<{ withTiming: number; config: { duration: number } }> = [];

// The real react-native entry is Flow-typed and cannot be parsed by vitest.
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
  AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(mockReduceMotion) },
  Platform: { OS: 'ios' },
}));

vi.mock('react-native-reanimated', () => ({
  makeMutable: (value: unknown) => ({ value }),
  withTiming: (value: number, config: { duration: number }) => {
    const marker = { withTiming: value, config };
    mockWithTimingCalls.push(marker);
    return marker;
  },
}));

import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { WindforgeProvider } from '@windforge/react-native';
import { useAnimatedThemeProgress, type AnimatedThemeProgressOptions } from '../src/theme.js';

function capture(options?: AnimatedThemeProgressOptions) {
  let sharedValue: { value: unknown } | undefined;
  function Consumer() {
    sharedValue = useAnimatedThemeProgress(options);
    return null;
  }
  return { Consumer, getSharedValue: () => sharedValue! };
}

function renderInScheme(scheme: 'light' | 'dark', element: ReturnType<typeof createElement>) {
  return create(
    createElement(WindforgeProvider, { colorScheme: scheme }, element),
  );
}

describe('useAnimatedThemeProgress', () => {
  beforeEach(() => {
    mockWithTimingCalls.length = 0;
  });

  it('initializes at 0 in light mode', () => {
    const { Consumer, getSharedValue } = capture();
    act(() => {
      create(createElement(Consumer));
    });
    expect(getSharedValue().value).toBe(0);
    expect(mockWithTimingCalls).toHaveLength(0);
  });

  it('animates to 1 on a dark flip with the default 400ms duration', () => {
    const { Consumer, getSharedValue } = capture();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = renderInScheme('light', createElement(Consumer));
    });
    act(() => {
      renderer.update(
        createElement(WindforgeProvider, { colorScheme: 'dark' }, createElement(Consumer)),
      );
    });
    expect(getSharedValue().value).toEqual({ withTiming: 1, config: { duration: 400 } });
  });

  it('animates back to 0 when the scheme flips back to light', () => {
    const { Consumer, getSharedValue } = capture();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = renderInScheme('light', createElement(Consumer));
    });
    act(() => {
      renderer.update(
        createElement(WindforgeProvider, { colorScheme: 'dark' }, createElement(Consumer)),
      );
    });
    act(() => {
      renderer.update(
        createElement(WindforgeProvider, { colorScheme: 'light' }, createElement(Consumer)),
      );
    });
    expect(getSharedValue().value).toEqual({ withTiming: 0, config: { duration: 400 } });
  });

  it('honors a custom duration', () => {
    const { Consumer, getSharedValue } = capture({ duration: 250 });
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = renderInScheme('light', createElement(Consumer));
    });
    act(() => {
      renderer.update(
        createElement(WindforgeProvider, { colorScheme: 'dark' }, createElement(Consumer)),
      );
    });
    expect(getSharedValue().value).toEqual({ withTiming: 1, config: { duration: 250 } });
  });

  it('snaps (duration 0) when reduced motion is enabled', async () => {
    mockReduceMotion = true;
    try {
      const { Consumer, getSharedValue } = capture();
      let renderer!: ReturnType<typeof create>;
      await act(async () => {
        renderer = renderInScheme('light', createElement(Consumer));
      });
      act(() => {
        renderer.update(
          createElement(WindforgeProvider, { colorScheme: 'dark' }, createElement(Consumer)),
        );
      });
      expect(getSharedValue().value).toEqual({ withTiming: 1, config: { duration: 0 } });
    } finally {
      mockReduceMotion = false;
    }
  });

  it('stops animating after unmount', () => {
    const { Consumer } = capture();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(Consumer));
    });
    renderer.unmount();
    const callsBefore = mockWithTimingCalls.length;
    act(() => {
      // Any scheme change now must not reach the unmounted hook.
      create(createElement(WindforgeProvider, { colorScheme: 'dark' }, createElement('Child')));
    });
    expect(mockWithTimingCalls).toHaveLength(callsBefore);
  });
});
