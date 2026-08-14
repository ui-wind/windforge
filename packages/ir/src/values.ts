/**
 * IR values.
 *
 * A value is a discriminated union so backends can lower each kind
 * explicitly. Values never carry platform types: no RN style objects, no CSS
 * strings, no Reanimated objects.
 */

/** Units that survive into the IR. `px` is RN-neutral density-independent
 * pixels on native; backends translate per platform. */
export type DimensionUnit =
  | 'px'
  | 'rem'
  | 'em'
  | 'vw'
  | 'vh'
  | 'percent'
  | 'points';

export type NumberValueIR = {
  kind: 'number';
  value: number;
};

export type StringValueIR = {
  kind: 'string';
  value: string;
};

/** A fully resolved color. The compiler resolves token/alpha/color-function
 * inputs to a canonical color string before the IR sees them. */
export type ColorValueIR = {
  kind: 'color';
  value: string;
};

/** A reference to a theme token, e.g. `colors.primary`. Resolved by the
 * runtime/theme layer or at build time when the token table is known. */
export type TokenValueIR = {
  kind: 'token';
  ref: string;
  category?: string;
};

/** A CSS-variable-style reference, e.g. `--wf-primary`. */
export type VariableValueIR = {
  kind: 'variable';
  name: string;
};

/** A calc() expression, stored as a string expression the backend evaluates
 * or lowers natively. */
export type CalcValueIR = {
  kind: 'calc';
  expression: string;
};

export type DimensionValueIR = {
  kind: 'dimension';
  value: number;
  unit: DimensionUnit;
};

export type ListValueIR = {
  kind: 'list';
  items: IRValue[];
};

export type TransformOperationIR =
  | { operation: 'translateX'; value: IRValue }
  | { operation: 'translateY'; value: IRValue }
  | { operation: 'translate'; value: [IRValue, IRValue] }
  | { operation: 'rotate'; value: IRValue }
  | { operation: 'rotateX'; value: IRValue }
  | { operation: 'rotateY'; value: IRValue }
  | { operation: 'rotateZ'; value: IRValue }
  | { operation: 'scale'; value: IRValue }
  | { operation: 'scaleX'; value: IRValue }
  | { operation: 'scaleY'; value: IRValue }
  | { operation: 'skewX'; value: IRValue }
  | { operation: 'skewY'; value: IRValue };

export type TransformValueIR = {
  kind: 'transform';
  operations: TransformOperationIR[];
};

/** A value that applies only when a condition holds; `fallback` applies
 * otherwise. */
export type ConditionalValueIR = {
  kind: 'conditional';
  /** Id of a ConditionIR declared in the same document. */
  conditionId: string;
  value: IRValue;
  fallback?: IRValue;
};

/** A value provided at runtime (e.g. from a shared-value binding). The ref
 * is opaque to the IR; backends interpret it. */
export type RuntimeValueIR = {
  kind: 'runtime';
  ref: string;
};

/** A physical safe-area inset edge, lowered from `env(safe-area-inset-*)`
 * (Phase 15). Backends resolve it at runtime against the platform safe-area
 * insets (native) or emit the `env()` function unchanged (web). Logical
 * start/end behavior is expressed with `layout-direction` variants around
 * physical edges, not as a logical value here. */
export type SafeAreaInsetEdge = 'top' | 'right' | 'bottom' | 'left';

export type SafeAreaValueIR = {
  kind: 'safe-area';
  inset: SafeAreaInsetEdge;
};

export type IRValue =
  | NumberValueIR
  | StringValueIR
  | ColorValueIR
  | TokenValueIR
  | VariableValueIR
  | CalcValueIR
  | DimensionValueIR
  | ListValueIR
  | TransformValueIR
  | ConditionalValueIR
  | RuntimeValueIR
  | SafeAreaValueIR;

/**
 * Compiler classification of a value, per the IR spec. Static values must be
 * fully lowered at build time.
 */
export type ValueClassification =
  | 'STATIC'
  | 'TOKEN'
  | 'CONDITIONAL'
  | 'RUNTIME'
  | 'ANIMATED';

const CLASSIFICATION_RANK: Record<ValueClassification, number> = {
  STATIC: 0,
  TOKEN: 1,
  CONDITIONAL: 2,
  RUNTIME: 3,
  ANIMATED: 4,
};

/** Classify a single value. Composite values (list, transform) take the
 * highest-ranked classification of their parts. */
export function classifyValue(value: IRValue): ValueClassification {
  switch (value.kind) {
    case 'number':
    case 'string':
    case 'color':
    case 'dimension':
      return 'STATIC';
    case 'token':
    case 'variable':
    case 'calc':
      return 'TOKEN';
    case 'conditional':
      return 'CONDITIONAL';
    case 'runtime':
    case 'safe-area':
      return 'RUNTIME';
    case 'list': {
      let max: ValueClassification = 'STATIC';
      for (const item of value.items) {
        const c = classifyValue(item);
        if (CLASSIFICATION_RANK[c] > CLASSIFICATION_RANK[max]) max = c;
      }
      return max;
    }
    case 'transform': {
      let max: ValueClassification = 'STATIC';
      for (const op of value.operations) {
        const parts = Array.isArray(op.value) ? op.value : [op.value];
        for (const part of parts) {
          const c = classifyValue(part);
          if (CLASSIFICATION_RANK[c] > CLASSIFICATION_RANK[max]) max = c;
        }
      }
      return max;
    }
  }
}
