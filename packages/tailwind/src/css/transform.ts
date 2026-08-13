/**
 * Transform lowering.
 *
 * Covers the modern individual transform properties Tailwind v4 emits
 * (`rotate`, `scale`, `translate` — typed by lightningcss) and the classic
 * `transform` function list (used inside @keyframes bodies). Both lower to
 * the canonical `transform` declaration. RN transform values: numbers for
 * scale/px translation, unit strings ('45deg', '-25%') for angles and
 * percentage translation.
 */
import type { IRValue, TransformOperationIR, TransformValueIR } from '@windforge/ir';
import { REM_PX, resolveTokenValue } from './resolve.js';
import { scalarValue, type CssToken } from './token-print.js';

type AnyRecord = Record<string, unknown>;

function round4(value: number): number {
  // lightningcss float noise (0.4000000059604645) must not leak into IR.
  return Number(value.toFixed(4));
}

const DEG_PER_UNIT: Record<string, number> = {
  deg: 1,
  grad: 0.9,
  turn: 360,
  rad: 180 / Math.PI,
};

/** Typed angle record → IR string value ('45deg', '0.5rad'). */
function typedAngleIR(angle: AnyRecord): IRValue | null {
  const unit = angle.type as string;
  const amount = angle.value as number;
  if (typeof amount !== 'number') return null;
  if (unit === 'rad') return { kind: 'string', value: `${round4(amount)}rad` };
  const perDeg = DEG_PER_UNIT[unit];
  if (perDeg === undefined) return null;
  return { kind: 'string', value: `${round4(amount * perDeg)}deg` };
}

/** Typed length/percentage (transform context) → IR value. */
function typedTransformLength(value: AnyRecord): IRValue | null {
  if (value.type === 'percentage') {
    const raw = value.value;
    const fraction =
      typeof raw === 'number' ? raw : ((raw as AnyRecord)?.value as number | undefined);
    if (typeof fraction !== 'number') return null;
    return { kind: 'string', value: `${round4(fraction * 100)}%` };
  }
  // Bare dimension: { type: 'dimension', value: { unit, value } } (the
  // individual `translate` property's axes arrive in this shape).
  if (value.type === 'dimension' && value.value && typeof value.value === 'object') {
    return typedDimensionValue(value.value as AnyRecord);
  }
  // length-percentage: { value: { type: 'dimension', value: { unit, value } } }
  const inner = value.value as AnyRecord | undefined;
  const dimension = (inner?.value ?? inner) as AnyRecord | undefined;
  return typedDimensionValue(dimension);
}

function typedDimensionValue(dimension: AnyRecord | undefined): IRValue | null {
  const unit = dimension?.unit as string | undefined;
  const amount = dimension?.value as number | undefined;
  if (typeof amount !== 'number') return null;
  if (unit === 'px') return { kind: 'number', value: round4(amount) };
  if (unit === 'rem') return { kind: 'number', value: round4(amount * REM_PX) };
  return null;
}

/** Zero-encoded axis records ({ type: 'value', value: { unit, value: 0 } }). */
function zeroIfZero(record: AnyRecord): boolean {
  if (record?.type === 'percentage' && Number(record.value) === 0) return true;
  if (record?.type === 'value') {
    const inner = record.value as AnyRecord | undefined;
    return Number(inner?.value) === 0;
  }
  return false;
}

/** Scale factor from a typed number or percentage (105% → 1.05). */
function typedScaleNumber(entry: unknown): number | null {
  const record = entry as AnyRecord;
  if (record?.type === 'percentage') {
    const raw = record.value;
    const fraction = typeof raw === 'number' ? raw : (raw as AnyRecord)?.value;
    return typeof fraction === 'number' ? round4(fraction) : null;
  }
  const numbers = typedNumbers(entry);
  const first = numbers && numbers.length === 1 ? numbers[0] : undefined;
  return typeof first === 'number' ? first : null;
}

/** Extract plain numbers from a typed scale value (bare, wrapped or list). */
function typedNumbers(value: unknown): number[] | null {
  const entries = Array.isArray(value) ? value : [value];
  const out: number[] = [];
  for (const entry of entries) {
    if (typeof entry === 'number') {
      out.push(entry);
      continue;
    }
    const record = entry as AnyRecord;
    if (record?.type === 'number' || record?.type === 'integer') {
      const inner = record.value as AnyRecord | number | undefined;
      const num =
        typeof inner === 'number' ? inner : ((inner as AnyRecord)?.value as number | undefined);
      if (typeof num !== 'number') return null;
      out.push(num);
      continue;
    }
    return null;
  }
  return out.length > 0 ? out : null;
}

/** scale factor list → operations (uniform collapses to a single `scale`). */
function scaleOperations(numbers: number[]): TransformOperationIR[] | null {
  if (numbers.length === 0 || numbers.length > 2) return null;
  const sx = round4(numbers[0] as number);
  const sy = numbers.length > 1 ? round4(numbers[1] as number) : sx;
  if (sx === sy) return [{ operation: 'scale', value: { kind: 'number', value: sx } }];
  return [
    { operation: 'scaleX', value: { kind: 'number', value: sx } },
    { operation: 'scaleY', value: { kind: 'number', value: sy } },
  ];
}

/** One typed transform function → operations, or null when unsupported. */
function typedTransformOperation(fn: AnyRecord): TransformOperationIR[] | null {
  const type = fn.type as string;
  switch (type) {
    case 'rotate':
    case 'rotateX':
    case 'rotateY':
    case 'rotateZ': {
      const angle = typedAngleIR(fn.value as AnyRecord);
      if (!angle) return null;
      const operation =
        type === 'rotate'
          ? 'rotate'
          : type === 'rotateX'
            ? 'rotateX'
            : type === 'rotateY'
              ? 'rotateY'
              : 'rotateZ';
      return [{ operation, value: angle }];
    }
    case 'scale': {
      const numbers = typedNumbers(fn.value);
      return numbers ? scaleOperations(numbers) : null;
    }
    case 'scaleX':
    case 'scaleY': {
      const numbers = typedNumbers(fn.value);
      if (!numbers || numbers.length !== 1) return null;
      return [
        {
          operation: type === 'scaleX' ? 'scaleX' : 'scaleY',
          value: { kind: 'number', value: round4(numbers[0] as number) },
        },
      ];
    }
    case 'translateX':
    case 'translateY': {
      const ir = typedTransformLength(fn.value as AnyRecord);
      if (!ir) return null;
      return [{ operation: type === 'translateX' ? 'translateX' : 'translateY', value: ir }];
    }
    case 'translate': {
      const entries = Array.isArray(fn.value) ? fn.value : [fn.value];
      const values = entries
        .filter((e) => e && typeof e === 'object')
        .map((e) => typedTransformLength(e as AnyRecord));
      const transform = translateOperations(values);
      return transform ? transform.operations : null;
    }
    case 'skewX':
    case 'skewY': {
      const angle = typedAngleIR(fn.value as AnyRecord);
      if (!angle) return null;
      return [{ operation: type === 'skewX' ? 'skewX' : 'skewY', value: angle }];
    }
    default:
      // matrix() and anything 3D-ish beyond the above are not lowerable in P0.
      return null;
  }
}

/** Lower a typed `transform` function list. An empty list means
 * `transform: none` and lowers to an empty operations array (identity),
 * which callers translate to "no transform declaration". */
export function lowerTransformFunctionList(fns: AnyRecord[]): TransformValueIR | null {
  const operations: TransformOperationIR[] = [];
  for (const fn of fns) {
    if (!fn || typeof fn !== 'object') return null;
    const ops = typedTransformOperation(fn);
    if (!ops) return null;
    operations.push(...ops);
  }
  return { kind: 'transform', operations };
}

/** Individual typed `rotate` property: { x, y, z, angle }. */
export function lowerRotateProperty(value: AnyRecord): TransformValueIR | null {
  const angle = typedAngleIR(value.angle as AnyRecord);
  if (!angle) return null;
  if (typeof value.x === 'number' && value.x !== 0) {
    return { kind: 'transform', operations: [{ operation: 'rotateX', value: angle }] };
  }
  if (typeof value.y === 'number' && value.y !== 0) {
    return { kind: 'transform', operations: [{ operation: 'rotateY', value: angle }] };
  }
  return { kind: 'transform', operations: [{ operation: 'rotate', value: angle }] };
}

/** Individual typed `scale` property: { x, y, z } axis object (z dropped —
 * RN scale is 2D) or a number/pair list. */
export function lowerScaleProperty(value: unknown): TransformValueIR | null {
  const numbers: number[] = [];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as AnyRecord;
    if ('x' in record || 'y' in record) {
      if (record.x === undefined) return null;
      const x = typedScaleNumber(record.x);
      if (x === null) return null;
      numbers.push(x);
      if (record.y !== undefined) {
        const y = typedScaleNumber(record.y);
        if (y === null) return null;
        numbers.push(y);
      }
      const operations = scaleOperations(numbers);
      return operations ? { kind: 'transform', operations } : null;
    }
  }
  const parsed = typedNumbers(value);
  if (!parsed) return null;
  const operations = scaleOperations(parsed);
  return operations ? { kind: 'transform', operations } : null;
}

/** Individual typed `translate` property: { x, y, z } axis object (z
 * dropped) or a length/percentage list. */
export function lowerTranslateProperty(value: unknown): TransformValueIR | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as AnyRecord;
    if ('x' in record || 'y' in record) {
      const values: IRValue[] = [];
      if (record.x !== undefined) {
        const x = typedTransformLength(record.x as AnyRecord);
        if (!x) return null;
        values.push(x);
      }
      if (record.y !== undefined) {
        const y =
          typedTransformLength(record.y as AnyRecord) ??
          (zeroIfZero(record.y as AnyRecord) ? ({ kind: 'number', value: 0 } as IRValue) : null);
        if (!y) return null;
        values.push(y);
      }
      return translateOperations(values);
    }
  }
  const entries = Array.isArray(value) ? value : [value];
  const values: IRValue[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') return null;
    const ir = typedTransformLength(entry as AnyRecord);
    if (!ir) return null;
    values.push(ir);
  }
  return translateOperations(values);
}

/** 1 value → translateX; 2 values → translate pair; nulls fail the whole. */
function translateOperations(values: (IRValue | null)[]): TransformValueIR | null {
  if (values.length === 1) {
    const x = values[0];
    return x ? { kind: 'transform', operations: [{ operation: 'translateX', value: x }] } : null;
  }
  if (values.length === 2) {
    const x = values[0];
    const y = values[1];
    return x && y
      ? { kind: 'transform', operations: [{ operation: 'translate', value: [x, y] }] }
      : null;
  }
  return null;
}

/** Unparsed `scale` tokens after var substitution (e.g. scale-105's
 * `var(--tw-scale-x) var(--tw-scale-y)` resolving to percentages). */
export function scaleFromTokens(tokens: CssToken[]): TransformValueIR | null {
  const numbers: number[] = [];
  for (const token of tokens) {
    if (token.type === 'white-space') continue;
    const resolved = resolveTokenValue(token);
    if (!resolved) return null;
    if (resolved.unit === 'percent') numbers.push(round4(resolved.value));
    else if (resolved.unit === 'none') numbers.push(round4(resolved.value));
    else return null;
  }
  const operations = scaleOperations(numbers);
  return operations ? { kind: 'transform', operations } : null;
}

/** Unparsed `translate` tokens after var substitution. */
export function translateFromTokens(tokens: CssToken[]): TransformValueIR | null {
  const values: IRValue[] = [];
  for (const token of tokens) {
    if (token.type === 'white-space') continue;
    const resolved = resolveTokenValue(token);
    if (!resolved) return null;
    if (resolved.unit === 'px') values.push({ kind: 'number', value: round4(resolved.value) });
    else if (resolved.unit === 'percent')
      values.push({ kind: 'string', value: `${round4(resolved.value * 100)}%` });
    else if (resolved.unit === 'none') {
      // Unitless numbers are only valid in CSS as zero (the default axis).
      if (resolved.value !== 0) return null;
      values.push({ kind: 'number', value: 0 });
    } else return null;
  }
  return translateOperations(values);
}

/** Dispatch for typed individual transform properties. */
export function transformFromTyped(property: string, value: unknown): TransformValueIR | null {
  switch (property) {
    case 'transform':
      return lowerTransformFunctionList(Array.isArray(value) ? (value as AnyRecord[]) : [value as AnyRecord]);
    case 'rotate':
      return value && typeof value === 'object' ? lowerRotateProperty(value as AnyRecord) : null;
    case 'scale':
      return lowerScaleProperty(value);
    case 'translate':
      return lowerTranslateProperty(value);
    default:
      return null;
  }
}

/** Dispatch for unparsed individual transform properties (post-substitution). */
export function transformFromTokens(property: string, tokens: CssToken[]): TransformValueIR | null {
  switch (property) {
    case 'scale':
      return scaleFromTokens(tokens);
    case 'translate':
      return translateFromTokens(tokens);
    default:
      // `rotate`/`transform` always arrive typed from lightningcss.
      return null;
  }
}
