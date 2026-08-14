/**
 * Shared types for the Tailwind frontend.
 */
import type {
  ConditionIR,
  DataConditionIR,
  InteractionState,
  StateConditionIR,
} from '@windforge/ir';

/** Frontend diagnostic. Codes are WF1xxx (Tailwind frontend layer). */
export type Diagnostic = {
  code: string;
  message: string;
};

/**
 * Resolved condition specs collected from @media queries and selectors. These
 * are lowered to @windforge/ir ConditionIR when the artifact is built.
 */
export type ConditionSpec =
  | { kind: 'color-scheme'; scheme: 'light' | 'dark' }
  | { kind: 'media-width'; operator: '>=' | '<='; px: number }
  | { kind: 'orientation'; orientation: 'portrait' | 'landscape' }
  | { kind: 'platform'; platform: 'ios' | 'android' | 'web' | 'native' }
  | { kind: 'layout-direction'; direction: 'ltr' | 'rtl' }
  | { kind: 'state'; state: InteractionState; group?: boolean; groupName?: string }
  | { kind: 'data'; name: string; value?: string };

/** Deterministic id for a condition spec. */
export function conditionId(spec: ConditionSpec): string {
  switch (spec.kind) {
    case 'color-scheme':
      return `color-scheme:${spec.scheme}`;
    case 'media-width':
      return `media-width:${spec.operator}:${spec.px}`;
    case 'orientation':
      return `orientation:${spec.orientation}`;
    case 'platform':
      return `platform:${spec.platform}`;
    case 'layout-direction':
      return `layout-direction:${spec.direction}`;
    case 'state': {
      let id = `state:${spec.state}`;
      if (spec.group) id += `:group${spec.groupName ? `:${spec.groupName}` : ''}`;
      return id;
    }
    case 'data':
      return spec.value === undefined
        ? `data:${spec.name}`
        : `data:${spec.name}=${spec.value}`;
  }
}

export function specToConditionIR(spec: ConditionSpec): ConditionIR {
  const id = conditionId(spec);
  switch (spec.kind) {
    case 'color-scheme':
      return { kind: 'color-scheme', id, scheme: spec.scheme };
    case 'media-width':
      return {
        kind: 'media',
        id,
        feature: spec.operator === '>=' ? 'min-width' : 'max-width',
        value: { kind: 'dimension', value: spec.px, unit: 'px' },
      };
    case 'orientation':
      return {
        kind: 'media',
        id,
        feature: 'orientation',
        value: { kind: 'string', value: spec.orientation },
      };
    case 'platform':
      return { kind: 'platform', id, platform: spec.platform };
    case 'layout-direction':
      return { kind: 'layout-direction', id, direction: spec.direction };
    case 'state': {
      const ir: StateConditionIR = { kind: 'state', id, state: spec.state };
      if (spec.group) {
        ir.group = true;
        if (spec.groupName !== undefined) ir.groupName = spec.groupName;
      }
      return ir;
    }
    case 'data': {
      const ir: DataConditionIR = { kind: 'data', id, name: spec.name };
      if (spec.value !== undefined) ir.value = spec.value;
      return ir;
    }
  }
}
