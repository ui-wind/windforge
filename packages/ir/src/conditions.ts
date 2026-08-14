/**
 * IR conditions.
 *
 * Conditions model the *reason* a declaration applies, without hard-coding
 * platform APIs (see IR spec, "Conditions"). Backends decide how each
 * condition kind is lowered: a `color-scheme(dark)` condition becomes a
 * JS-side appearance subscription on native and a `prefers-color-scheme`
 * media rule on web.
 */
import type { IRValue } from './values.js';

export type MediaFeature =
  | 'min-width'
  | 'max-width'
  | 'min-height'
  | 'max-height'
  | 'orientation'
  | 'prefers-color-scheme';

export type MediaConditionIR = {
  kind: 'media';
  id: string;
  feature: MediaFeature;
  value: IRValue;
};

export type ColorSchemeConditionIR = {
  kind: 'color-scheme';
  id: string;
  scheme: 'light' | 'dark';
};

export type PlatformConditionIR = {
  kind: 'platform';
  id: string;
  platform: 'ios' | 'android' | 'web' | 'native';
};

/** Layout direction — driven by `rtl:`/`ltr:` variants on native and the
 * `dir` attribute (or CSS direction) on web. */
export type LayoutDirectionConditionIR = {
  kind: 'layout-direction';
  id: string;
  direction: 'ltr' | 'rtl';
};

export type InteractionState =
  | 'hover'
  | 'focus'
  | 'active'
  | 'disabled'
  | 'visited'
  | 'checked'
  | 'empty'
  | 'readonly'
  | 'required'
  | 'first'
  | 'last';

export type StateConditionIR = {
  kind: 'state';
  id: string;
  state: InteractionState;
  /** True when the state comes from a parent/group, e.g. `group-hover:`. */
  group?: boolean;
  /** Scope name for named groups, e.g. `group/sidebar-hover:`. */
  groupName?: string;
};

/**
 * Data-attribute condition (`data-[selected]` / `data-[selected=true]`).
 *
 * Evaluated against the component's props, not the environment: on native
 * the runtime reads the matching `data-*` prop (presence, or exact match
 * when `value` is set); on web the same selectors apply to DOM attributes.
 */
export type DataConditionIR = {
  kind: 'data';
  id: string;
  /** Attribute name without the `data-` prefix (e.g. `selected`). */
  name: string;
  /** Expected value; absent means attribute presence (any value). */
  value?: string;
};

export type ContainerOperator = '>' | '>=' | '<' | '<=' | '=';

export type ContainerConditionIR = {
  kind: 'container';
  id: string;
  feature: 'width' | 'height' | 'orientation';
  operator: ContainerOperator;
  value: IRValue;
  /** Named container, e.g. `@container/sidebar`. */
  name?: string;
};

/** Escape hatch for frontend-defined variants (`@custom-variant`). */
export type CustomConditionIR = {
  kind: 'custom';
  id: string;
  name: string;
  payload?: IRValue;
};

export type ConditionIR =
  | MediaConditionIR
  | ColorSchemeConditionIR
  | PlatformConditionIR
  | LayoutDirectionConditionIR
  | StateConditionIR
  | DataConditionIR
  | ContainerConditionIR
  | CustomConditionIR;

export type ConditionKind = ConditionIR['kind'];
