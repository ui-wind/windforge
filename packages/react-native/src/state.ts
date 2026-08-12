/**
 * Condition state: the runtime facts conditions evaluate against.
 */

export type ConditionState = {
  colorScheme: 'light' | 'dark';
  platform: 'ios' | 'android' | 'web';
  windowWidth: number;
  windowHeight: number;
};

/** Compact signature used as part of style-cache keys. */
export function stateSignature(state: ConditionState): string {
  return `${state.colorScheme}|${state.platform}|${state.windowWidth}x${state.windowHeight}`;
}
