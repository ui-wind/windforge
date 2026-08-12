/**
 * Shared types for the Tailwind frontend.
 */
import type { ConditionIR } from '@windforge/ir';

/** Frontend diagnostic. Codes are WF1xxx (Tailwind frontend layer). */
export type Diagnostic = {
  code: string;
  message: string;
};

/**
 * Resolved condition specs collected from @media queries. These are lowered
 * to @windforge/ir ConditionIR when the artifact is built.
 */
export type ConditionSpec =
  | { kind: 'color-scheme'; scheme: 'light' | 'dark' }
  | { kind: 'media-width'; operator: '>=' | '<='; px: number }
  | { kind: 'orientation'; orientation: 'portrait' | 'landscape' }
  | { kind: 'platform'; platform: 'ios' | 'android' | 'web' | 'native' };

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
  }
}
