/**
 * WindforgeProvider: supplies the condition state (color scheme, platform,
 * window dimensions) to styled components and re-renders on change.
 */
import {
  createElement,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  Appearance,
  Dimensions,
  Platform,
  useWindowDimensions,
} from 'react-native';
import type { ConditionState } from './state.js';

export type WindforgeContextValue = {
  state: ConditionState;
};

const WindforgeContext = createContext<WindforgeContextValue | null>(null);

export function useWindforge(): WindforgeContextValue {
  const value = useContext(WindforgeContext);
  if (!value) {
    // Sensible defaults outside a provider keep unit tests and simple apps
    // working; a wrapped app should still mount the provider for live
    // color-scheme updates.
    return {
      state: {
        colorScheme: Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
        platform: platformOf(Platform.OS),
        windowWidth: Dimensions.get('window').width,
        windowHeight: Dimensions.get('window').height,
      },
    };
  }
  return value;
}

function platformOf(os: string): ConditionState['platform'] {
  if (os === 'ios' || os === 'android' || os === 'web') return os;
  return 'android';
}

export type WindforgeProviderProps = {
  children: ReactNode;
  /** Override the color scheme instead of following the system. */
  colorScheme?: 'light' | 'dark';
};

export function WindforgeProvider(props: WindforgeProviderProps): ReactNode {
  const dimensions = useWindowDimensions();
  const [scheme, setScheme] = useState<'light' | 'dark'>(
    props.colorScheme ?? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'),
  );

  useEffect(() => {
    if (props.colorScheme) {
      setScheme(props.colorScheme);
      return undefined;
    }
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => subscription.remove();
  }, [props.colorScheme]);

  const value = useMemo<WindforgeContextValue>(
    () => ({
      state: {
        colorScheme: scheme,
        platform: platformOf(Platform.OS),
        windowWidth: dimensions.width,
        windowHeight: dimensions.height,
      },
    }),
    [scheme, dimensions.width, dimensions.height],
  );

  return createElement(WindforgeContext.Provider, { value }, props.children);
}
