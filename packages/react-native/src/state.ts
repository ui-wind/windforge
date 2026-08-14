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

/** Interaction facts of one component instance (Phase 11). */
export type GroupInteractionState = {
  pressed?: boolean;
  hovered?: boolean;
  focused?: boolean;
  disabled?: boolean;
};

/**
 * Per-component state evaluated by `state` and `data` conditions:
 * interaction flags captured by the interactive components, a snapshot of
 * the component's `data-*` props (`data-[selected=true]:…`), and the
 * interaction state of ancestor `.group` providers keyed by group name
 * (`''` = anonymous `group`).
 */
export type ComponentState = GroupInteractionState & {
  /** `data-*` prop snapshot; values are compared as strings. */
  data?: Record<string, string | number | boolean | null | undefined>;
  /** Ancestor group states (`group-hover:`…); nearest provider wins per name. */
  groups?: Record<string, GroupInteractionState>;
};

/** Prop values compared as strings: `true` → `'true'`, numbers stringified. */
export function normalizeDataValue(value: string | number | boolean): string {
  return String(value);
}

/** Compact signature used as part of style-cache keys. Empty when absent. */
export function componentStateSignature(state?: ComponentState): string {
  if (!state) return '';
  const parts: string[] = [];
  if (state.pressed) parts.push('pressed');
  if (state.hovered) parts.push('hovered');
  if (state.focused) parts.push('focused');
  if (state.disabled) parts.push('disabled');
  if (state.data) {
    for (const key of Object.keys(state.data).sort()) {
      const value = state.data[key];
      if (value === undefined || value === null) continue;
      parts.push(`data:${key}=${normalizeDataValue(value)}`);
    }
  }
  if (state.groups) {
    for (const name of Object.keys(state.groups).sort()) {
      const group = state.groups[name];
      if (!group) continue;
      parts.push(`group:${name}:${componentGroupFlags(group)}`);
    }
  }
  return parts.join(';');
}

function componentGroupFlags(group: GroupInteractionState): string {
  let flags = '';
  if (group.pressed) flags += 'p';
  if (group.hovered) flags += 'h';
  if (group.focused) flags += 'f';
  if (group.disabled) flags += 'd';
  return flags;
}
