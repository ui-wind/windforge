/**
 * Condition state store + WindforgeProvider.
 *
 * Conditions (color scheme, dimensions) are observed once, in the provider,
 * and published through a subscription store:
 *
 * - js-baseline components subscribe (via `useConditionState`) and
 *   re-render on change — the traditional behavior.
 * - fabric components do not subscribe; the provider forwards changes to
 *   `backend.onConditionsChanged`, and native delivery lands the update
 *   without re-rendering the styled tree.
 *
 * The provider itself never re-renders on condition changes, so children
 * that do not subscribe stay untouched.
 */
import {
  Fragment,
  createElement,
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Appearance, Dimensions, I18nManager, PixelRatio, Platform } from 'react-native';
import { getBackend } from './backends/index.js';
import type { ConditionState } from './state.js';
import {
  getThemeState,
  initThemeColorScheme,
  setTheme,
  subscribeTheme,
  syncThemeColorScheme,
} from './theme.js';

export type WindforgeContextValue = {
  state: ConditionState;
};

function platformOf(os: string): ConditionState['platform'] {
  if (os === 'ios' || os === 'android' || os === 'web') return os;
  return 'android';
}

/**
 * Layout direction is observed once: toggling RTL on native requires an app
 * restart (`I18nManager.forceRTL`), so a live subscription would never fire.
 */
function readLayoutDirection(): ConditionState['layoutDirection'] {
  return I18nManager.getConstants().isRTL ? 'rtl' : 'ltr';
}

function readConditions(): ConditionState {
  return {
    colorScheme: Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
    platform: platformOf(Platform.OS),
    windowWidth: Dimensions.get('window').width,
    windowHeight: Dimensions.get('window').height,
    fontScale: PixelRatio.getFontScale(),
    pixelRatio: PixelRatio.get(),
    layoutDirection: readLayoutDirection(),
    theme: getThemeState().current,
  };
}

let conditions: ConditionState = readConditions();
const subscribers = new Set<() => void>();

export function getConditions(): ConditionState {
  return conditions;
}

export function subscribeConditions(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

function setConditions(next: ConditionState): void {
  const prev = conditions;
  conditions = next;
  getBackend().onConditionsChanged?.(next, prev);
  for (const listener of [...subscribers]) listener();
}

// Phase 12 — keep conditions.theme in sync with the ThemeStore. When the
// user calls setTheme() or when colorScheme changes while requested==='system',
// the ThemeStore updates first, then this subscriber pushes the new theme into
// the conditions snapshot so cache keys and useConditionState consumers update.
subscribeTheme(() => {
  const current = getThemeState().current;
  if (conditions.theme !== current) {
    const prev = conditions;
    conditions = { ...conditions, theme: current };
    getBackend().onConditionsChanged?.(conditions, prev);
    for (const listener of [...subscribers]) listener();
  }
});

const noopSubscribe = () => () => {};

/**
 * Current condition state. Pass `subscribe = false` to read the snapshot
 * without re-rendering on change (fabric backend components).
 */
export function useConditionState(subscribe = true): ConditionState {
  return useSyncExternalStore(
    subscribe ? subscribeConditions : noopSubscribe,
    getConditions,
    getConditions,
  );
}

/** Live condition state, shaped like the historical context value. */
export function useWindforge(): WindforgeContextValue {
  return { state: useConditionState() };
}

export type WindforgeProviderProps = {
  children: ReactNode;
  /** Override the color scheme instead of following the system. */
  colorScheme?: 'light' | 'dark';
  /**
   * Phase 15 — seed the initial theme from an existing class on the document
   * element (web only). When SSR renders `<html class="sunset">` or similar,
   * passing `initialThemes={['light', 'dark', 'sunset']}` makes the client
   * detect the matching class at mount and apply it before the first paint,
   * preventing a flash-of-default-theme. First match wins. Ignored on native.
   */
  initialThemes?: string[];
};

/** Detect the current theme from document.documentElement.classList (web).
 * Returns null when no candidate matches or when not running on web.
 * Exported for unit tests (`__detectInitialTheme`). */
export function __detectInitialTheme(candidates: string[]): string | null {
  if (Platform.OS !== 'web') return null;
  // Guard for environments where document is unavailable (SSR pre-hydration).
  const doc = (globalThis as Record<string, unknown>).document as
    | { documentElement?: { classList?: { contains(name: string): boolean } } }
    | undefined;
  if (!doc) return null;
  const classList = doc.documentElement?.classList;
  if (!classList) return null;
  for (const name of candidates) {
    if (classList.contains(name)) return name;
  }
  return null;
}

export function WindforgeProvider(props: WindforgeProviderProps): ReactNode {
  const { colorScheme, initialThemes } = props;

  // Phase 15 — seed the ThemeStore from the document's class list before the
  // first paint so SSR-rendered themes don't flicker back to default.
  useLayoutEffect(() => {
    if (!initialThemes || initialThemes.length === 0) return undefined;
    const detected = __detectInitialTheme(initialThemes);
    if (detected !== null && getThemeState().requested === 'system') {
      setTheme(detected);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // The override participates in the first paint; without a layout effect
  // subscribers would render one frame with the system scheme.
  useLayoutEffect(() => {
    if (!colorScheme) return undefined;
    if (conditions.colorScheme !== colorScheme) {
      setConditions({ ...conditions, colorScheme });
    }
    return undefined;
  }, [colorScheme]);

  // Phase 12 — seed the ThemeStore with the initial color scheme so that
  // `requested === 'system'` resolves correctly from the first render.
  useLayoutEffect(() => {
    initThemeColorScheme(conditions.colorScheme);
    return undefined;
  }, []);

  useEffect(() => {
    if (colorScheme) {
      // System changes are ignored while overridden; the layout effect above
      // keeps the store in sync if the prop itself changes.
      return undefined;
    }
    const appearanceSubscription = Appearance.addChangeListener(
      ({ colorScheme: scheme }) => {
        const next = scheme === 'dark' ? 'dark' : 'light';
        // Phase 12 — notify the ThemeStore so 'system'-requested themes
        // resolve to the new color scheme before conditions update.
        syncThemeColorScheme(next);
        if (conditions.colorScheme !== next) {
          setConditions({ ...conditions, colorScheme: next });
        }
      },
    );
    const dimensionsSubscription = Dimensions.addEventListener('change', (event: { window: { width: number; height: number } }) => {
      // fontScale can change with a dimension change on Android (accessibility
      // font scaling); re-read it alongside the window size.
      const fontScale = PixelRatio.getFontScale();
      if (
        conditions.windowWidth !== event.window.width ||
        conditions.windowHeight !== event.window.height ||
        conditions.fontScale !== fontScale
      ) {
        setConditions({
          ...conditions,
          windowWidth: event.window.width,
          windowHeight: event.window.height,
          fontScale,
        });
      }
    });
    return () => {
      appearanceSubscription.remove();
      dimensionsSubscription.remove();
    };
  }, [colorScheme]);

  return createElement(Fragment, null, props.children);
}
