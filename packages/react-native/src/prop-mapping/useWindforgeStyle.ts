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
 *
 * Phase 11: pass `componentState` to evaluate `state:`/`data:` conditions
 * from your own interaction tracking (third-party interactive components);
 * ancestor group context is merged in automatically unless overridden.
 */
import { useMemo } from 'react';
import { getBackend } from '../backends/index.js';
import { useGroupStates } from '../group.js';
import { useConditionState } from '../provider.js';
import type { ReactNativeStyle } from '../resolve.js';
import type { ComponentState } from '../state.js';

const EMPTY_STYLE: ReactNativeStyle = {};

export function useWindforgeStyle(
  className?: string,
  componentState?: ComponentState,
): ReactNativeStyle {
  const backend = getBackend();
  const state = useConditionState(true);
  const groupStates = useGroupStates();
  return useMemo(() => {
    if (!className) return EMPTY_STYLE;
    let merged = componentState;
    if (groupStates && !merged?.groups) {
      merged = { ...merged, groups: groupStates };
    }
    return backend.resolveStyle(className, state, merged);
  }, [backend, className, state, componentState, groupStates]);
}
