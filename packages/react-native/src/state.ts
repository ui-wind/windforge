/**
 * Condition state: the runtime facts conditions evaluate against.
 */

export type ConditionState = {
  colorScheme: 'light' | 'dark';
  platform: 'ios' | 'android' | 'web';
  windowWidth: number;
  windowHeight: number;
  /** System font scale (RN PixelRatio); 1 on platforms without the concept. */
  fontScale: number;
  /** Device pixel ratio (RN PixelRatio). */
  pixelRatio: number;
  /** Layout direction; changing it requires an app restart. */
  layoutDirection: 'ltr' | 'rtl';
};

/** Compact signature used as part of style-cache keys. */
export function stateSignature(state: ConditionState): string {
  return (
    `${state.colorScheme}|${state.platform}|${state.windowWidth}x${state.windowHeight}` +
    `|f${state.fontScale}|p${state.pixelRatio}|d${state.layoutDirection}`
  );
}
