/**
 * Condition evaluation against runtime state.
 *
 * Pure logic — no react-native imports — so it is trivially testable and
 * reusable by the web backend.
 */
import type { ConditionIR } from '@windforge/ir';
import type { ConditionState } from './state.js';

export function evaluateCondition(
  condition: ConditionIR,
  state: ConditionState,
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
    // Interactive / container conditions are not evaluated by the MVP
    // runtime; the interactive backend (Phase 2) owns them.
    case 'state':
    case 'container':
    case 'custom':
      return false;
  }
}

function numberValue(condition: ConditionIR): number | null {
  if (condition.kind !== 'media') return null;
  const value = condition.value;
  if (value.kind === 'number') return value.value;
  if (value.kind === 'dimension') {
    // Only px reaches the runtime today; the compiler bridges rem at build time.
    return value.unit === 'px' || value.unit === 'points' ? value.value : null;
  }
  return null;
}
