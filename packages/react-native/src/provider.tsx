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
};

export function WindforgeProvider(props: WindforgeProviderProps): ReactNode {
  const { colorScheme } = props;

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
    const dimensionsSubscription = Dimensions.addEventListener('change', ({ window }) => {
      // fontScale can change with a dimension change on Android (accessibility
      // font scaling); re-read it alongside the window size.
      const fontScale = PixelRatio.getFontScale();
      if (
        conditions.windowWidth !== window.width ||
        conditions.windowHeight !== window.height ||
        conditions.fontScale !== fontScale
      ) {
        setConditions({
          ...conditions,
          windowWidth: window.width,
          windowHeight: window.height,
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
