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
  | StateConditionIR
  | ContainerConditionIR
  | CustomConditionIR;

export type ConditionKind = ConditionIR['kind'];
