/**
 * Optional safe area entrypoint — `@windforge/react-native/safe-area`.
 *
 * Safe area insets are not part of the core condition state: they are
 * read-only metrics, and observing them requires mounting
 * react-native-safe-area-context's native provider node. Apps that need
 * insets through `useMetrics()`/`useInsets()` wrap their tree once with
 * `WindforgeSafeAreaProvider`; apps that don't pay nothing.
 */
import { createElement, useEffect, type ReactNode } from 'react';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { setInsets } from './metrics.js';

/** Invisible bridge: forwards live insets into the Windforge metrics store. */
function InsetsBridge(): null {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    setInsets(insets);
  }, [insets.top, insets.right, insets.bottom, insets.left]);
  return null;
}

/**
 * Mounts react-native-safe-area-context's provider and publishes the insets
 * into the Windforge metrics store. Wrap the tree once, outside (or inside)
 * `WindforgeProvider` — the metrics store is module-global either way.
 */
export function WindforgeSafeAreaProvider(props: { children: ReactNode }): ReactNode {
  return createElement(SafeAreaProvider, null, createElement(InsetsBridge), props.children);
}
