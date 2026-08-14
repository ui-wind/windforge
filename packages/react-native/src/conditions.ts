/**
 * Condition evaluation against runtime state.
 *
 * Pure logic — no react-native imports — so it is trivially testable and
 * reusable by the web backend.
 */
import type { ConditionIR, InteractionState } from '@windforge/ir';
import {
  normalizeDataValue,
  type ComponentState,
  type ConditionState,
  type GroupInteractionState,
} from './state.js';

export function evaluateCondition(
  condition: ConditionIR,
  state: ConditionState,
  componentState?: ComponentState,
): boolean {
  switch (condition.kind) {
    case 'color-scheme':
      return state.colorScheme === condition.scheme;
    case 'platform':
      if (condition.platform === 'native') return state.platform !== 'web';
      return state.platform === condition.platform;
    case 'layout-direction':
      return state.layoutDirection === condition.direction;
    case 'media': {
      const threshold = numberValue(condition);
      switch (condition.feature) {
        case 'min-width':
          return threshold !== null && state.windowWidth >= threshold;
        case 'max-width':
          return threshold !== null && state.windowWidth <= threshold;
        case 'min-height':
          return threshold !== null && state.windowHeight >= threshold;
        case 'max-height':
          return threshold !== null && state.windowHeight <= threshold;
        case 'orientation': {
          const expected = condition.value.kind === 'string' ? condition.value.value : null;
          const actual = state.windowWidth >= state.windowHeight ? 'landscape' : 'portrait';
          return expected === actual;
        }
        case 'prefers-color-scheme':
          return condition.value.kind === 'string' && condition.value.value === state.colorScheme;
      }
      return false;
    }
    case 'state': {
      if (!componentState) return false;
      const source: GroupInteractionState = condition.group
        ? componentState.groups?.[condition.groupName ?? ''] ?? {}
        : componentState;
      return interactionFlag(condition.state, source);
    }
    case 'data': {
      const value = componentState?.data?.[condition.name];
      if (value === undefined || value === null) return false;
      if (condition.value === undefined) return true;
      return normalizeDataValue(value) === condition.value;
    }
    // Phase 12 — named theme conditions. Active when the effective theme
    // name matches. The caller passes the scoped theme override (if any) via
    // `state.theme`; it defaults to the global ThemeStore.current.
    case 'theme':
      return state.theme === condition.name;
    // Container conditions are not evaluated by the current runtime.
    case 'container':
    case 'custom':
      return false;
  }
}

/** InteractionState → component fact. States without a native source
 * (visited/checked/…) never activate. */
function interactionFlag(state: InteractionState, source: GroupInteractionState): boolean {
  switch (state) {
    case 'hover':
      return source.hovered === true;
    case 'focus':
      return source.focused === true;
    case 'active':
      return source.pressed === true;
    case 'disabled':
      return source.disabled === true;
    case 'visited':
    case 'checked':
    case 'empty':
    case 'readonly':
    case 'required':
    case 'first':
    case 'last':
      return false;
  }
}

function numberValue(condition: ConditionIR): number | null {
  if (condition.kind !== 'media') return null;
  const value = condition.value;
  if (value.kind === 'number') return value.value;
  if (value.kind === 'dimension') {
    // Only px/points reaches the runtime today; the compiler bridges rem at build time.
    return value.unit === 'px' || value.unit === 'points' ? value.value : null;
  }
  return null;
}
