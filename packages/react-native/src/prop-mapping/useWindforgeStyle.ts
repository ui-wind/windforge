/**
 * Resolve a className string into a style object for components Windforge
 * does not wrap: feed the result to any style prop.
 *
 *   <ScrollView contentContainerStyle={useWindforgeStyle('gap-3 p-6')} />
 *
 * The hook always subscribes to condition state: its output typically feeds
 * secondary style surfaces (contentContainerStyle and friends) that the
 * native delivery protocol cannot bind — subscribing is what keeps them
 * correct when conditions flip on the fabric backend. Stable object
 * identity comes from the composed-string cache.
 */
import { useMemo } from 'react';
import { getBackend } from '../backends/index.js';
import { useConditionState } from '../provider.js';
import type { ReactNativeStyle } from '../resolve.js';

const EMPTY_STYLE: ReactNativeStyle = {};

export function useWindforgeStyle(className?: string): ReactNativeStyle {
  const backend = getBackend();
  const state = useConditionState(true);
  return useMemo(
    () => (className ? backend.resolveStyle(className, state) : EMPTY_STYLE),
    [backend, className, state],
  );
}
