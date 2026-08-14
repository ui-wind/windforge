/**
 * Phase 15 — Web theme initialization (parity with Uniwind Pro 1.5.1).
 *
 * Tests the `initialThemes` prop on WindforgeProvider: when SSR renders
 * `<html class="sunset">`, the client should detect the matching class at
 * mount and seed the ThemeStore before the first paint, avoiding flicker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock react-native with Platform.OS = 'web' so __detectInitialTheme passes
// the platform gate. Provider needs Appearance/Dimensions/I18nManager/etc.
vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Appearance: { getColorScheme: () => 'light', addChangeListener: () => ({ remove() {} }) },
  Dimensions: { get: () => ({ width: 390, height: 844 }), addEventListener: () => ({ remove() {} }) },
  I18nManager: { getConstants: () => ({ isRTL: false }) },
  PixelRatio: { getFontScale: () => 1, get: () => 3 },
}));

import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { __detectInitialTheme } from '../src/provider.js';
import { WindforgeProvider } from '../src/provider.js';
import { __resetRegistry, registerArtifact } from '../src/registry.js';
import { __clearStyleCache } from '../src/resolve.js';
import { getThemeState, __resetThemeState } from '../src/theme.js';
import type { RuntimeArtifact } from '../src/types.js';

const artifact: RuntimeArtifact = {
  version: 2,
  irVersion: 1,
  hash: 'web-theme-init',
  styles: {},
  conditions: [],
};

describe('__detectInitialTheme (unit)', () => {
  const originalDocument = (globalThis as Record<string, unknown>).document;

  afterEach(() => {
    if (originalDocument === undefined) {
      delete (globalThis as Record<string, unknown>).document;
    } else {
      (globalThis as Record<string, unknown>).document = originalDocument;
    }
  });

  it('returns the first matching candidate from documentElement.classList', () => {
    (globalThis as Record<string, unknown>).document = {
      documentElement: {
        classList: { contains: (name: string) => name === 'sunset' || name === 'ocean' },
      },
    };
    // First match wins.
    expect(__detectInitialTheme(['light', 'sunset', 'ocean'])).toBe('sunset');
  });

  it('returns null when no candidate matches', () => {
    (globalThis as Record<string, unknown>).document = {
      documentElement: {
        classList: { contains: () => false },
      },
    };
    expect(__detectInitialTheme(['light', 'dark'])).toBeNull();
  });

  it('returns null when document.documentElement is missing', () => {
    (globalThis as Record<string, unknown>).document = {};
    expect(__detectInitialTheme(['light'])).toBeNull();
  });

  it('returns null when document is undefined (SSR pre-hydration)', () => {
    delete (globalThis as Record<string, unknown>).document;
    expect(__detectInitialTheme(['light'])).toBeNull();
  });
});

describe('WindforgeProvider initialThemes integration', () => {
  const originalDocument = (globalThis as Record<string, unknown>).document;

  beforeEach(() => {
    __resetThemeState();
    __resetRegistry();
    __clearStyleCache();
    registerArtifact(artifact);
  });

  afterEach(() => {
    if (originalDocument === undefined) {
      delete (globalThis as Record<string, unknown>).document;
    } else {
      (globalThis as Record<string, unknown>).document = originalDocument;
    }
  });

  it('seeds the ThemeStore from a matching document class at mount', () => {
    (globalThis as Record<string, unknown>).document = {
      documentElement: {
        classList: { contains: (name: string) => name === 'sunset' },
      },
    };

    // Default state is requested='system', current='light'.
    expect(getThemeState().requested).toBe('system');

    // Render the provider with initialThemes — layout effect fires synchronously
    // in act mode.
    act(() => {
      create(createElement(WindforgeProvider, { initialThemes: ['light', 'dark', 'sunset'] }, null));
    });

    // setTheme was called → requested changed from 'system' to 'sunset'.
    expect(getThemeState().requested).toBe('sunset');
    expect(getThemeState().current).toBe('sunset');
  });

  it('does not override when no candidate matches', () => {
    (globalThis as Record<string, unknown>).document = {
      documentElement: {
        classList: { contains: () => false },
      },
    };

    act(() => {
      create(createElement(WindforgeProvider, { initialThemes: ['light', 'dark'] }, null));
    });

    // No match → stays on default system/light.
    expect(getThemeState().requested).toBe('system');
  });
});
