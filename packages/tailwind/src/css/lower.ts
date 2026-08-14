/**
 * CSS declaration → IR declaration lowering.
 *
 * Every value is resolved to a static IR value at build time (Strategy A):
 * var()/calc() resolved against the theme variable map, rem bridged at 16px,
 * modern colors converted to hex, logical/longhand properties expanded to the
 * canonical RN-compatible set.
 */
import type {
  AnimationIR,
  CanonicalProperty,
  IRValue,
  KeyframeIR,
  TimingFunctionIR,
  TransitionIR,
} from '@windforge/ir';
import type { Diagnostic } from '../types.js';
import { colorToHex, isColorValue } from './color.js';
import type { CollectedDeclaration } from './collect.js';
import { printTokens, scalarValue, type CssToken } from './token-print.js';
import {
  REM_PX,
  resolveNumeric,
  substituteVars,
  type ResolvedNumeric,
  type VariableMap,
} from './resolve.js';
import {
  isTypedAnimationNone,
  lowerTimingFunction,
  parseAnimationShorthand,
  timeMsFromTokens,
  timingFunctionFromTokens,
  typedAnimationShorthand,
  type AnimationShorthand,
} from './animation.js';
import { transformFromTokens, transformFromTyped } from './transform.js';

type AnyRecord = Record<string, unknown>;

/** Result of lowering one rule: canonical declarations plus animation
 * metadata (present only when the rule carries animation-* / transition-*). */
export type LoweredRule = {
  declarations: LoweredDeclaration[];
  animation?: AnimationIR;
  transition?: TransitionIR;
};

/** Animation properties handled in lowerRule (not lowerDeclaration). */
export const ANIMATION_PROPERTIES = new Set([
  'animation',
  'animation-name',
  'animation-duration',
  'animation-delay',
  'animation-timing-function',
  'animation-iteration-count',
  'animation-direction',
  'animation-fill-mode',
]);

/** Transition longhands handled in lowerRule. */
export const TRANSITION_PROPERTIES = new Set([
  'transition-property',
  'transition-duration',
  'transition-delay',
  'transition-timing-function',
]);

/** Individual modern transform properties (typed by lightningcss). */
export const TRANSFORM_PROPERTIES = new Set([
  'transform',
  'rotate',
  'scale',
  'translate',
]);

export type LowerContext = {
  diagnostics: Diagnostic[];
  /** font-size (px) seen earlier in the same rule; line-height multipliers
   * and em units resolve against it (falls back to the 16px base). */
  fontSizePx: number | null;
};

export type LoweredDeclaration = {
  property: CanonicalProperty;
  value: IRValue;
  /** Carried from the source `!important` flag (Phase 15). */
  important?: boolean;
};

type ValueKind = 'dimension' | 'color' | 'keyword' | 'number';

/** CSS property → canonical property + value kind, for simple 1:1 mappings. */
const SIMPLE_PROPERTIES: Record<string, { target: CanonicalProperty; kind: ValueKind }> = {
  // layout — dimensions
  width: { target: 'width', kind: 'dimension' },
  height: { target: 'height', kind: 'dimension' },
  'min-width': { target: 'minWidth', kind: 'dimension' },
  'min-height': { target: 'minHeight', kind: 'dimension' },
  'max-width': { target: 'maxWidth', kind: 'dimension' },
  'max-height': { target: 'maxHeight', kind: 'dimension' },
  top: { target: 'top', kind: 'dimension' },
  right: { target: 'right', kind: 'dimension' },
  bottom: { target: 'bottom', kind: 'dimension' },
  left: { target: 'left', kind: 'dimension' },
  // Logical insets lower to RN's direction-aware `start`/`end` (Phase 15 —
  // safe-area utilities).
  'inset-inline-start': { target: 'start', kind: 'dimension' },
  'inset-inline-end': { target: 'end', kind: 'dimension' },
  'flex-basis': { target: 'flexBasis', kind: 'dimension' },
  'row-gap': { target: 'rowGap', kind: 'dimension' },
  'column-gap': { target: 'columnGap', kind: 'dimension' },
  // box model — per-side
  'padding-top': { target: 'paddingTop', kind: 'dimension' },
  'padding-right': { target: 'paddingRight', kind: 'dimension' },
  'padding-bottom': { target: 'paddingBottom', kind: 'dimension' },
  'padding-left': { target: 'paddingLeft', kind: 'dimension' },
  'padding-inline-start': { target: 'paddingInlineStart', kind: 'dimension' },
  'padding-inline-end': { target: 'paddingInlineEnd', kind: 'dimension' },
  'margin-top': { target: 'marginTop', kind: 'dimension' },
  'margin-right': { target: 'marginRight', kind: 'dimension' },
  'margin-bottom': { target: 'marginBottom', kind: 'dimension' },
  'margin-left': { target: 'marginLeft', kind: 'dimension' },
  'margin-inline-start': { target: 'marginInlineStart', kind: 'dimension' },
  'margin-inline-end': { target: 'marginInlineEnd', kind: 'dimension' },
  // borders
  'border-top-width': { target: 'borderTopWidth', kind: 'dimension' },
  'border-right-width': { target: 'borderRightWidth', kind: 'dimension' },
  'border-bottom-width': { target: 'borderBottomWidth', kind: 'dimension' },
  'border-left-width': { target: 'borderLeftWidth', kind: 'dimension' },
  'border-top-color': { target: 'borderTopColor', kind: 'color' },
  'border-right-color': { target: 'borderRightColor', kind: 'color' },
  'border-bottom-color': { target: 'borderBottomColor', kind: 'color' },
  'border-left-color': { target: 'borderLeftColor', kind: 'color' },
  // Per-corner radii (Phase 15 — joined corner utilities like
  // `rounded-tl-lg rounded-br-xl`). The shorthand form expands in the typed
  // path; these mappings handle the individual CSS longhands that Tailwind
  // emits when only some corners are set.
  'border-top-left-radius': { target: 'borderTopLeftRadius', kind: 'dimension' },
  'border-top-right-radius': { target: 'borderTopRightRadius', kind: 'dimension' },
  'border-bottom-right-radius': { target: 'borderBottomRightRadius', kind: 'dimension' },
  'border-bottom-left-radius': { target: 'borderBottomLeftRadius', kind: 'dimension' },
  // paint
  'background-color': { target: 'backgroundColor', kind: 'color' },
  color: { target: 'color', kind: 'color' },
  'border-color': { target: 'borderColor', kind: 'color' },
  opacity: { target: 'opacity', kind: 'number' },
  'z-index': { target: 'zIndex', kind: 'number' },
  'flex-grow': { target: 'flexGrow', kind: 'number' },
  'flex-shrink': { target: 'flexShrink', kind: 'number' },
  'aspect-ratio': { target: 'aspectRatio', kind: 'number' },
  // typography / layout keywords
  display: { target: 'display', kind: 'keyword' },
  position: { target: 'position', kind: 'keyword' },
  'flex-direction': { target: 'flexDirection', kind: 'keyword' },
  'flex-wrap': { target: 'flexWrap', kind: 'keyword' },
  'align-items': { target: 'alignItems', kind: 'keyword' },
  'align-content': { target: 'alignContent', kind: 'keyword' },
  'align-self': { target: 'alignSelf', kind: 'keyword' },
  'justify-content': { target: 'justifyContent', kind: 'keyword' },
  'text-align': { target: 'textAlign', kind: 'keyword' },
  'text-transform': { target: 'textTransform', kind: 'keyword' },
  'font-style': { target: 'fontStyle', kind: 'keyword' },
  'border-style': { target: 'borderStyle', kind: 'keyword' },
  'pointer-events': { target: 'pointerEvents', kind: 'keyword' },
};

/** Properties lowered later (interactive backend). */
const DEFERRED_PROPERTIES = new Set([
  'cursor',
  'caret-color',
  'scroll-behavior',
  'user-select',
]);

/** Per-side border styles (`border-t` emits `border-top-style` next to the
 * width). React Native only has an all-sides borderStyle; see
 * lowerSideBorderStyle. */
const SIDE_BORDER_STYLE_PROPERTIES = new Set([
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
]);

/** Shorthands that expand into typed multi-side values. Unparsed (var/calc)
 * variants of these are resolved to a single number and synthesized into the
 * same typed shape so one expansion path handles both. */
const BOX_SHORTHAND_PROPERTIES = new Set([
  'padding',
  'margin',
  'border-width',
  'border-radius',
  'gap',
  'padding-inline',
  'padding-block',
  'margin-inline',
  'margin-block',
]);

function synthesizeTypedValue(
  property: string,
  resolved: ResolvedNumeric,
): AnyRecord | null {
  let side: AnyRecord | null = null;
  if (resolved.unit === 'px') {
    side = {
      type: 'length-percentage',
      value: { type: 'dimension', value: { unit: 'px', value: resolved.value } },
    };
  } else if (resolved.unit === 'percent') {
    side = {
      type: 'length-percentage',
      value: { type: 'percentage', value: resolved.value / 100 },
    };
  }
  if (!side) return null;
  switch (property) {
    case 'padding':
    case 'margin':
    case 'border-width':
      return { top: side, right: side, bottom: side, left: side };
    case 'border-radius':
      return { topLeft: side, topRight: side, bottomRight: side, bottomLeft: side };
    case 'gap':
      return { row: side, column: side };
    case 'padding-inline':
    case 'margin-inline':
      return { inlineStart: side, inlineEnd: side };
    case 'padding-block':
    case 'margin-block':
      return { blockStart: side, blockEnd: side };
    default:
      return side;
  }
}

function numericToIR(
  resolved: ResolvedNumeric,
): IRValue {
  if (resolved.unit === 'percent') {
    return { kind: 'dimension', value: resolved.value, unit: 'percent' };
  }
  // `px` and unitless multipliers both lower to plain numbers.
  return { kind: 'number', value: roundPx(resolved.value) };
}

function roundPx(value: number): number {
  // Keep fractional px where meaningful (opacity, flex) but drop float noise.
  return Number(value.toFixed(4));
}

/** Extract an ident from either flat or wrapped typed idents. */
function typedIdent(value: AnyRecord): string | null {
  if (value.type !== 'ident') return null;
  if (typeof value.value === 'string') return value.value;
  const inner = value.value as AnyRecord | undefined;
  if (inner && inner.type === 'ident' && typeof inner.value === 'string') {
    return inner.value;
  }
  return null;
}

/** lightningcss enums whose `.type` discriminator is itself the CSS keyword
 * (e.g. `position: absolute` → `{type:'absolute'}`, `align-self: stretch` →
 * `{type:'stretch'}`). Values not in this set are not lowered from `.type`. */
const TYPE_AS_KEYWORD_ENUMS = new Set([
  'auto',
  'baseline',
  'normal',
  'stretch',
  'static',
  'relative',
  'absolute',
  'fixed',
  'sticky',
  'italic',
]);

/** Extract a CSS keyword from lightningcss's typed value shapes.
 *
 * Keyword properties arrive in four shapes: bare strings
 * (`flex-direction: column`), `{type:'ident'}` wrappers, typed enums that
 * carry the keyword in `.value` (`align-items` → self-position,
 * `justify-content` → content-distribution/content-position,
 * `display: none` → `{type:'keyword', value:'none'}`), and enums whose `.type`
 * is the keyword itself. Complex shapes we don't statically lower (display's
 * `pair`, text-transform's case object, border-style's per-side object) return
 * null so the caller reports WF1005. */
function typedKeyword(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const record = value as AnyRecord;
  const ident = typedIdent(record);
  if (ident !== null) return ident;
  if (
    (record.type === 'self-position' ||
      record.type === 'content-distribution' ||
      record.type === 'content-position' ||
      record.type === 'keyword') &&
    typeof record.value === 'string'
  ) {
    return record.value;
  }
  if (typeof record.type === 'string' && TYPE_AS_KEYWORD_ENUMS.has(record.type)) {
    return record.type;
  }
  return null;
}

/** Alignment targets that need CSS `start`/`end` mapped to the flex keywords
 * React Native accepts (hand-written `align-items: start`; Tailwind utilities
 * already emit flex-start/flex-end). */
const ALIGNMENT_KEYWORD_TARGETS = new Set([
  'alignItems',
  'alignContent',
  'alignSelf',
  'justifyContent',
]);

/** Extract a px value from a typed length-percentage. Percentages return null. */
function typedLengthPx(value: AnyRecord): number | null {
  const inner = value.value as AnyRecord | undefined;
  // Bare dimension records (e.g. border-radius corner tokens
  // `{type:'dimension', value:{unit, value}}`) carry the unit directly.
  if (inner && typeof inner.unit === 'string') {
    const amount = inner.value as number;
    if (typeof amount !== 'number') return null;
    if (inner.unit === 'px') return amount;
    if (inner.unit === 'rem') return amount * REM_PX;
    return null;
  }
  const dimension = (inner?.value ?? inner) as AnyRecord | undefined;
  if (!dimension) return null;
  const unit = dimension.unit as string;
  const amount = dimension.value as number;
  if (unit === 'px') return amount;
  if (unit === 'rem') return amount * REM_PX;
  return null;
}

/** Extract a percentage number from a typed length-percentage, else null.
 * Typed percentages are fractions: `0.5` means 50%. */
function typedPercentage(value: AnyRecord): number | null {
  const inner = value.value as AnyRecord | undefined;
  if (inner?.type !== 'percentage') return null;
  const raw = inner.value;
  const fraction = typeof raw === 'number' ? raw : (raw as AnyRecord)?.value;
  return typeof fraction === 'number' ? fraction * 100 : null;
}

/** `env(safe-area-inset-*)` name → physical inset edge (Phase 15). */
const SAFE_AREA_INSETS: Record<string, 'top' | 'right' | 'bottom' | 'left'> = {
  'safe-area-inset-top': 'top',
  'safe-area-inset-right': 'right',
  'safe-area-inset-bottom': 'bottom',
  'safe-area-inset-left': 'left',
};

/**
 * Lower a single `env(safe-area-inset-*)` value to a runtime `safe-area` IR
 * value (Phase 15). Returns null for any other shape — env() names we do
 * not know, fallback lists, or values mixed with other tokens fall through
 * to the regular diagnostics.
 */
function safeAreaValueIR(tokens: CssToken[]): IRValue | null {
  const significant = tokens.filter((t) => t.type !== 'white-space');
  if (significant.length !== 1) return null;
  const only = significant[0] as CssToken;
  if (only.type !== 'env') return null;
  const nameRecord = (only.value as AnyRecord | undefined)?.name as AnyRecord | undefined;
  const name = nameRecord?.value;
  if (typeof name !== 'string') return null;
  const inset = SAFE_AREA_INSETS[name];
  if (!inset) return null;
  return { kind: 'safe-area', inset };
}

/** `calc(infinity * 1px)` (Tailwind's `rounded-full`) lowers to a px
 * dimension whose value is null; map it to a large finite radius. RN clips
 * the radius to the view's half-size, so any large number is visually
 * equivalent — 9999 matches the common "pill" idiom. */
const INFINITE_RADIUS_PX = 9999;

function isInfiniteLength(token: unknown): boolean {
  if (!token || typeof token !== 'object') return false;
  const inner = (token as AnyRecord).value as AnyRecord | undefined;
  const dimension = (inner?.value ?? inner) as AnyRecord | undefined;
  if (!dimension || dimension.unit !== 'px') return false;
  return dimension.value === null || dimension.value === undefined;
}

/** Lower one border-radius corner. lightningcss types each corner as a list
 * of one or two length-percentages (horizontal, then optional vertical
 * radius); Tailwind only emits the single-value form. */
function lowerRadiusValue(corner: unknown, ctx: LowerContext, propertyLabel: string): IRValue | null {
  const tokens = Array.isArray(corner) ? corner : [corner];
  const significant = tokens.filter((t) => t && typeof t === 'object');
  if (significant.length === 0) return null;
  if (significant.length > 1) {
    const [horizontal, vertical] = significant;
    if (JSON.stringify(vertical) !== JSON.stringify(horizontal)) {
      ctx.diagnostics.push({
        code: 'WF1005',
        message: `Cannot statically lower elliptical ${propertyLabel}`,
      });
      return null;
    }
  }
  const first = significant[0] as unknown;
  if (isInfiniteLength(first)) return { kind: 'number', value: INFINITE_RADIUS_PX };
  if (!first || typeof first !== 'object') return null;
  return typedDimensionIR(first as AnyRecord);
}

/**
 * Lower a typed lightningcss math function (min/max/clamp) when every argument
 * is a static length/percentage of a homogeneous unit. Returns null for mixed
 * units (require runtime reference lengths not available at build time).
 */
function typedMathFunctionIR(value: AnyRecord): IRValue | null {
  // Outer shape: {type:'length-percentage', value:{type:'calc', value:fn}}
  const calc = value.value as AnyRecord | undefined;
  if (calc?.type !== 'calc') return null;
  const fn = calc.value as AnyRecord | undefined;
  if (fn?.type !== 'function') return null;
  const inner = fn.value as AnyRecord | undefined;
  const name = inner?.type as string | undefined;
  if (name !== 'min' && name !== 'max' && name !== 'clamp') return null;
  if (!inner) return null;
  const argList = inner.value as AnyRecord[] | undefined;
  if (!Array.isArray(argList)) return null;

  type ArgResult = { value: number; unit: 'px' | 'percent' };
  const resolved: ArgResult[] = [];
  for (const arg of argList) {
    if (arg.type !== 'value') return null;
    const lp = arg.value as AnyRecord | undefined;
    if (!lp || typeof lp !== 'object') return null;
    const percent = typedPercentage(lp);
    if (percent !== null) {
      resolved.push({ value: percent, unit: 'percent' });
      continue;
    }
    const px = typedLengthPx(lp);
    if (px !== null) {
      resolved.push({ value: px, unit: 'px' });
      continue;
    }
    return null;
  }
  if (resolved.length === 0) return null;

  // All arguments must share the same unit family. Zero-valued entries with no
  // unit are compatible with any dimensional unit per CSS spec.
  let effectiveUnit: 'px' | 'percent' | 'none' = 'none';
  for (const r of resolved) {
    if (r.unit === 'percent' || r.unit === 'px') {
      if (effectiveUnit === 'none') effectiveUnit = r.unit;
      else if (r.unit !== effectiveUnit) return null;
    }
  }
  // All-zero edge case.
  if (effectiveUnit === 'none') effectiveUnit = 'px';

  const numbers = resolved.map((r) => r.value);
  let result: number;
  if (name === 'min') result = Math.min(...numbers);
  else if (name === 'max') result = Math.max(...numbers);
  else {
    // clamp(MIN, VAL, MAX) — three arguments required.
    if (resolved.length !== 3) return null;
    result = Math.min(Math.max(numbers[1]!, numbers[0]!), numbers[2]!);
  }

  if (effectiveUnit === 'percent') {
    return { kind: 'dimension', value: roundPx(result), unit: 'percent' };
  }
  return { kind: 'number', value: roundPx(result) };
}

function typedDimensionIR(value: AnyRecord): IRValue | null {
  const percent = typedPercentage(value);
  if (percent !== null) {
    return { kind: 'dimension', value: percent, unit: 'percent' };
  }
  const px = typedLengthPx(value);
  if (px !== null) return { kind: 'number', value: roundPx(px) };
  // Phase 15 — typed min()/max()/clamp() from lightningcss.
  const math = typedMathFunctionIR(value);
  if (math) return math;
  return null;
}

function typedNumber(value: AnyRecord): number | null {
  // Typed shape: { type: 'number', value: { value } }; some typed values
  // (e.g. flex grow/shrink) are bare numbers.
  if (typeof value === 'number') return value;
  if (value.type === 'number' || value.type === 'integer') {
    const inner = value.value as AnyRecord | undefined;
    if (inner && typeof inner.value === 'number') return inner.value;
    if (typeof value.value === 'number') return value.value;
  }
  return null;
}

/**
 * Lower an unparsed token list: var-substitute, then try numeric evaluation,
 * then fall back to a bare keyword.
 */
function lowerUnparsed(
  tokens: CssToken[],
  kind: ValueKind,
  vars: VariableMap,
  ctx: LowerContext,
  propertyLabel: string,
): IRValue | null {
  const substituted = substituteVars(tokens, vars);

  // Colors are not numeric: substitute var() references and convert to hex
  // first, without going through resolveNumeric (which would emit a spurious
  // WF1002 for a perfectly valid color variable).
  if (kind === 'color') {
    if (substituted) {
      const significant = substituted.filter((t) => t.type !== 'white-space');
      if (significant.length === 1) {
        const only = significant[0] as CssToken;
        if (isColorValue(only.value)) {
          const hex = colorToHex(only.value as AnyRecord);
          if (hex) return { kind: 'color', value: hex };
        }
      }
      ctx.diagnostics.push({
        code: 'WF1005',
        message: `Cannot statically lower ${propertyLabel}: "${printTokens(tokens)}"`,
      });
    } else {
      ctx.diagnostics.push({
        code: 'WF1001',
        message: `Unresolvable var() reference in "${printTokens(tokens)}"`,
      });
    }
    return null;
  }

  // Keywords are not numeric either: after var substitution the value must
  // be a single ident (Tailwind's `border-style: var(--tw-border-style)`).
  if (kind === 'keyword') {
    if (!substituted) {
      ctx.diagnostics.push({
        code: 'WF1001',
        message: `Unresolvable var() reference in "${printTokens(tokens)}"`,
      });
      return null;
    }
    const significant = substituted.filter((t) => t.type !== 'white-space');
    if (significant.length === 1) {
      const only = significant[0] as CssToken;
      if (only.type === 'ident' || only.type === 'string') {
        const scalar = scalarValue(only);
        const text = typeof scalar === 'string' ? scalar : String(scalar ?? '');
        if (text) return { kind: 'string', value: text };
      }
    }
    ctx.diagnostics.push({
      code: 'WF1005',
      message: `Cannot statically lower ${propertyLabel}: "${printTokens(tokens)}"`,
    });
    return null;
  }

  // Phase 15 — `env(safe-area-inset-*)` values are runtime-resolved on
  // native; lower them to `safe-area` IR before numeric evaluation so they
  // don't emit WF1002/WF1005. Only meaningful for dimension properties.
  if (kind === 'dimension') {
    const safeArea = safeAreaValueIR(substituted ?? tokens);
    if (safeArea) return safeArea;
  }

  const resolved = resolveNumeric(tokens, vars, ctx.diagnostics);
  if (resolved !== null) return numericToIR(resolved);

  if (substituted) {
    const significant = substituted.filter((t) => t.type !== 'white-space');
    if (significant.length === 1) {
      const only = significant[0] as CssToken;
      if (only.type === 'ident' || only.type === 'string') {
        const scalar = scalarValue(only);
        const text = typeof scalar === 'string' ? scalar : String(scalar ?? '');
        if (text) return { kind: 'string', value: text };
      }
    }
  }

  ctx.diagnostics.push({
    code: 'WF1005',
    message: `Cannot statically lower ${propertyLabel}: "${printTokens(tokens)}"`,
  });
  return null;
}

function lowerTypedColor(value: AnyRecord, ctx: LowerContext, propertyLabel: string): IRValue | null {
  const hex = colorToHex(value);
  if (hex) return { kind: 'color', value: hex };
  ctx.diagnostics.push({
    code: 'WF1005',
    message: `Cannot statically lower color for ${propertyLabel}`,
  });
  return null;
}

/** Per-side `border-*-style` (see SIDE_BORDER_STYLE_PROPERTIES). The value
 * `solid` matches RN's borderStyle default → no-op; anything else is
 * reported (WF1003). */
function lowerSideBorderStyle(
  declaration: CollectedDeclaration,
  vars: VariableMap,
  ctx: LowerContext,
): LoweredDeclaration[] {
  let keyword: string | null = null;
  if (declaration.unparsed) {
    const substituted = substituteVars(declaration.value as CssToken[], vars);
    if (substituted) {
      const significant = substituted.filter((t) => t.type !== 'white-space');
      if (significant.length === 1) {
        const scalar = scalarValue(significant[0] as CssToken);
        if (typeof scalar === 'string') keyword = scalar;
      }
    }
  } else {
    keyword = typedKeyword(declaration.value as AnyRecord);
  }
  if (keyword === 'solid') return [];
  ctx.diagnostics.push({
    code: 'WF1003',
    message: `Property "${declaration.property}" has no React Native equivalent; skipped`,
  });
  return [];
}

/** Lower one side of a box shorthand (padding/margin/border-width). */
function lowerBoxValue(side: unknown): IRValue | null {
  if (!side || typeof side !== 'object') return null;
  return typedDimensionIR(side as AnyRecord);
}

function sameValue(a: IRValue, b: IRValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Lower a four-side box value `{top,right,bottom,left}` to either a single
 * shorthand declaration or four longhands.
 */
function lowerBox(
  value: AnyRecord,
  shorthand: CanonicalProperty,
  sides: [CanonicalProperty, CanonicalProperty, CanonicalProperty, CanonicalProperty],
  ctx: LowerContext,
  propertyLabel: string,
): LoweredDeclaration[] {
  const keys = ['top', 'right', 'bottom', 'left'] as const;
  const values: (IRValue | null)[] = keys.map((key) => lowerBoxValue(value[key]));
  if (values.some((v) => v === null)) return [];
  const [top, right, bottom, left] = values as [IRValue, IRValue, IRValue, IRValue];
  if (
    sameValue(top, right) &&
    sameValue(right, bottom) &&
    sameValue(bottom, left)
  ) {
    return [{ property: shorthand, value: top }];
  }
  return [
    { property: sides[0], value: top },
    { property: sides[1], value: right },
    { property: sides[2], value: bottom },
    { property: sides[3], value: left },
  ];
}

function lowerFontSize(
  declaration: CollectedDeclaration,
  vars: VariableMap,
  ctx: LowerContext,
): LoweredDeclaration[] {
  let px: number | null = null;
  if (declaration.unparsed) {
    const resolved = resolveNumeric(
      declaration.value as CssToken[],
      vars,
      ctx.diagnostics,
    );
    if (resolved && resolved.unit === 'px') px = resolved.value;
  } else {
    const typed = declaration.value as AnyRecord;
    px = typedLengthPx(typed);
  }
  if (px === null) {
    ctx.diagnostics.push({
      code: 'WF1005',
      message: 'Cannot statically lower font-size',
    });
    return [];
  }
  ctx.fontSizePx = roundPx(px);
  return [{ property: 'fontSize', value: { kind: 'number', value: ctx.fontSizePx } }];
}

function lowerLineHeight(
  declaration: CollectedDeclaration,
  vars: VariableMap,
  ctx: LowerContext,
): LoweredDeclaration[] {
  const base = ctx.fontSizePx ?? REM_PX;
  if (!declaration.unparsed) {
    const typed = declaration.value as AnyRecord;
    const multiplier = typedNumber(typed);
    if (multiplier !== null) {
      return [
        { property: 'lineHeight', value: { kind: 'number', value: roundPx(multiplier * base) } },
      ];
    }
    const px = typedLengthPx(typed);
    if (px !== null) {
      return [{ property: 'lineHeight', value: { kind: 'number', value: roundPx(px) } }];
    }
  } else {
    const resolved = resolveNumeric(
      declaration.value as CssToken[],
      vars,
      ctx.diagnostics,
    );
    if (resolved) {
      const px = resolved.unit === 'px' ? resolved.value : resolved.value * base;
      return [{ property: 'lineHeight', value: { kind: 'number', value: roundPx(px) } }];
    }
  }
  ctx.diagnostics.push({
    code: 'WF1005',
    message: 'Cannot statically lower line-height',
  });
  return [];
}

function lowerLetterSpacing(
  declaration: CollectedDeclaration,
  vars: VariableMap,
  ctx: LowerContext,
): LoweredDeclaration[] {
  const base = ctx.fontSizePx ?? REM_PX;
  if (declaration.unparsed) {
    const tokens = declaration.value as CssToken[];
    // em units resolve against the rule's font-size (already normalized).
    for (const token of tokens) {
      if (token.type !== 'length' && token.type !== 'dimension') continue;
      const dimension = token.value as AnyRecord | undefined;
      if (dimension?.unit === 'em') {
        const px = (dimension.value as number) * base;
        return [{ property: 'letterSpacing', value: { kind: 'number', value: roundPx(px) } }];
      }
    }
    const resolved = resolveNumeric(tokens, vars, ctx.diagnostics);
    if (resolved && resolved.unit === 'px') {
      return [{ property: 'letterSpacing', value: { kind: 'number', value: roundPx(resolved.value) } }];
    }
  } else {
    const typed = declaration.value as AnyRecord;
    const px = typedLengthPx(typed);
    if (px !== null) {
      return [{ property: 'letterSpacing', value: { kind: 'number', value: roundPx(px) } }];
    }
  }
  ctx.diagnostics.push({
    code: 'WF1005',
    message: 'Cannot statically lower letter-spacing',
  });
  return [];
}

function lowerFontWeight(
  declaration: CollectedDeclaration,
  vars: VariableMap,
  ctx: LowerContext,
): LoweredDeclaration[] {
  let weight: number | string | null = null;
  if (!declaration.unparsed) {
    const typed = declaration.value as AnyRecord;
    weight = typedNumber(typed);
    weight ??= typedIdent(typed);
  } else {
    const substituted = substituteVars(declaration.value as CssToken[], vars);
    if (substituted) {
      const significant = substituted.filter((t) => t.type !== 'white-space');
      if (significant.length === 1) {
        const only = significant[0] as CssToken;
        // Scalar tokens can be flat (`value: 700`) or wrapped
        // (`value: { value: 700 }`); scalarValue handles both.
        const scalar = scalarValue(only);
        if (only.type === 'number' || only.type === 'integer') {
          weight = typeof scalar === 'number' ? scalar : null;
        } else if (only.type === 'ident') {
          weight = typeof scalar === 'string' ? scalar : String(scalar ?? '');
        }
      }
    }
  }
  if (weight === null) {
    ctx.diagnostics.push({
      code: 'WF1005',
      message: 'Cannot statically lower font-weight',
    });
    return [];
  }
  // React Native fontWeight is a string ('400', '700', 'bold', …).
  return [
    { property: 'fontWeight', value: { kind: 'string', value: String(weight) } },
  ];
}

function lowerFontFamily(
  declaration: CollectedDeclaration,
  vars: VariableMap,
  ctx: LowerContext,
): LoweredDeclaration[] {
  let text: string | null = null;
  if (declaration.unparsed) {
    const substituted = substituteVars(declaration.value as CssToken[], vars);
    if (substituted) {
      const significant = substituted.filter((t) => t.type !== 'white-space' && t.type !== 'comma');
      if (significant.length === 1) {
        text = printTokens(significant);
      }
    }
  } else {
    const typed = declaration.value as AnyRecord;
    const families = typed.value as unknown[];
    if (Array.isArray(families) && families.length === 1) {
      const family = families[0] as AnyRecord;
      text = (family.value as string) ?? null;
    }
  }
  if (!text) {
    ctx.diagnostics.push({
      code: 'WF1005',
      message: 'Cannot statically lower font-family (stacks with fallbacks are unsupported)',
    });
    return [];
  }
  // Strip CSS quoting; RN wants the bare family name.
  const unquoted = text.replace(/^["']|["']$/g, '');
  return [{ property: 'fontFamily', value: { kind: 'string', value: unquoted } }];
}

// ---- animation / transition metadata -------------------------------------

/** CSS property → canonical property for `transition-property` lists.
 * Unmapped properties cannot animate in RN and are dropped from the list. */
const TRANSITION_PROPERTY_MAP: Record<string, CanonicalProperty> = {
  'background-color': 'backgroundColor',
  'border-color': 'borderColor',
  'border-top-color': 'borderTopColor',
  'border-right-color': 'borderRightColor',
  'border-bottom-color': 'borderBottomColor',
  'border-left-color': 'borderLeftColor',
  'border-width': 'borderWidth',
  'border-top-width': 'borderTopWidth',
  'border-right-width': 'borderRightWidth',
  'border-bottom-width': 'borderBottomWidth',
  'border-left-width': 'borderLeftWidth',
  'border-radius': 'borderRadius',
  color: 'color',
  opacity: 'opacity',
  transform: 'transform',
  rotate: 'transform',
  scale: 'transform',
  translate: 'transform',
  width: 'width',
  height: 'height',
  'min-width': 'minWidth',
  'min-height': 'minHeight',
  'max-width': 'maxWidth',
  'max-height': 'maxHeight',
  top: 'top',
  right: 'right',
  bottom: 'bottom',
  left: 'left',
  'padding-top': 'paddingTop',
  'padding-right': 'paddingRight',
  'padding-bottom': 'paddingBottom',
  'padding-left': 'paddingLeft',
  'margin-top': 'marginTop',
  'margin-right': 'marginRight',
  'margin-bottom': 'marginBottom',
  'margin-left': 'marginLeft',
  gap: 'gap',
  'row-gap': 'rowGap',
  'column-gap': 'columnGap',
  'flex-grow': 'flexGrow',
  'flex-shrink': 'flexShrink',
  'flex-basis': 'flexBasis',
  'font-size': 'fontSize',
  'letter-spacing': 'letterSpacing',
  'z-index': 'zIndex',
  'aspect-ratio': 'aspectRatio',
};

/** Typed `transition-property` value → 'all' | canonical list | null. */
function transitionPropertyList(value: unknown): 'all' | CanonicalProperty[] | null {
  if (!Array.isArray(value)) return null;
  const out: CanonicalProperty[] = [];
  const seen = new Set<CanonicalProperty>();
  let all = false;
  for (const item of value as AnyRecord[]) {
    const prop = item.property as string;
    if (prop === 'all') {
      all = true;
      continue;
    }
    const canonical = TRANSITION_PROPERTY_MAP[prop];
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }
  if (all) return 'all';
  return out;
}

/** Unparsed (comma-separated ident) `transition-property` → 'all' | list. */
function transitionPropertyTokens(tokens: CssToken[]): 'all' | CanonicalProperty[] | null {
  const out: CanonicalProperty[] = [];
  const seen = new Set<CanonicalProperty>();
  let all = false;
  for (const token of tokens) {
    if (token.type !== 'ident') continue;
    const prop = String(scalarValue(token) ?? '');
    if (prop === 'all') {
      all = true;
      continue;
    }
    const canonical = TRANSITION_PROPERTY_MAP[prop];
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }
  if (all) return 'all';
  return out;
}

/** Single significant token of a typed list or bare value. */
function firstTypedToken(value: unknown): AnyRecord | null {
  const list = Array.isArray(value) ? value : [value];
  for (const entry of list) {
    if (entry && typeof entry === 'object' && (entry as AnyRecord).type !== 'white-space') {
      return entry as AnyRecord;
    }
  }
  return null;
}

function typedString(token: AnyRecord): string | null {
  if (typeof token.value === 'string') return token.value;
  const inner = token.value as AnyRecord | undefined;
  if (inner && typeof inner.value === 'string') return inner.value;
  return null;
}

// `| undefined` lets shorthand-reset assign undefined explicitly
// (exactOptionalPropertyTypes) — CSS shorthand resets every longhand.
type AnimationFields = {
  name?: string | undefined;
  durationMs?: number | undefined;
  delayMs?: number | undefined;
  timingFunction?: TimingFunctionIR | undefined;
  iterationCount?: number | 'infinite' | undefined;
  direction?: AnimationIR['direction'] | undefined;
  fillMode?: AnimationIR['fillMode'] | undefined;
};

/**
 * Lower a rule's declarations plus animation metadata.
 *
 * Transition/animation longhands are merged per-field (later wins within the
 * rule) into TransitionIR/AnimationIR instead of producing declarations —
 * they have no RN style equivalent and drive the animation backends.
 */
export function lowerRuleDeclarations(
  declarations: CollectedDeclaration[],
  vars: VariableMap,
  keyframes: Map<string, KeyframeIR[]>,
  diagnostics: Diagnostic[],
  locals?: VariableMap,
): LoweredRule {
  // Rule-local custom properties (e.g. `--tw-scale-x`) shadow theme vars.
  if (locals && locals.size > 0) vars = new Map([...vars, ...locals]);
  const ctx: LowerContext = { diagnostics, fontSizePx: null };
  const out: LoweredDeclaration[] = [];
  const transition: TransitionIR = { properties: 'all' };
  let hasTransition = false;
  const anim: AnimationFields = {};

  for (const declaration of declarations) {
    const property = declaration.property;

    // ---- transition longhands --------------------------------------------
    if (TRANSITION_PROPERTIES.has(property)) {
      hasTransition = true;
      if (property === 'transition-property') {
        const list = declaration.unparsed
          ? transitionPropertyTokens(substituteVars(declaration.value as CssToken[], vars) ?? [])
          : transitionPropertyList(declaration.value);
        if (list) transition.properties = list;
        continue;
      }
      const ms = timeMsFromTokens(
        declaration.unparsed
          ? (substituteVars(declaration.value as CssToken[], vars) ?? [])
          : ((declaration.value as unknown as CssToken[]) ?? []),
      );
      if (property === 'transition-duration') {
        if (ms !== null) transition.duration = { ms };
        continue;
      }
      if (property === 'transition-delay') {
        if (ms !== null) transition.delay = { ms };
        continue;
      }
      // transition-timing-function
      const easing = declaration.unparsed
        ? timingFunctionFromTokens(substituteVars(declaration.value as CssToken[], vars) ?? [])
        : lowerTimingFunction(declaration.value);
      if (easing) transition.timingFunction = easing;
      continue;
    }

    // ---- animation shorthand / longhands ---------------------------------
    if (ANIMATION_PROPERTIES.has(property)) {
      if (property === 'animation') {
        let shorthand: AnimationShorthand | null = null;
        if (declaration.unparsed) {
          const tokens = declaration.value as CssToken[];
          const substituted = substituteVars(tokens, vars);
          if (!substituted) {
            diagnostics.push({
              code: 'WF1001',
              message: `Unresolvable var() reference in "${printTokens(tokens)}"`,
            });
            continue;
          }
          shorthand = parseAnimationShorthand(substituted);
          if (!shorthand || !shorthand.name) {
            diagnostics.push({
              code: 'WF1006',
              message: `Cannot statically lower animation: "${printTokens(tokens)}"`,
            });
            continue;
          }
        } else {
          const entries = Array.isArray(declaration.value)
            ? (declaration.value as AnyRecord[])
            : [];
          const entry = entries[0];
          if (!entry) continue;
          if (isTypedAnimationNone(entry)) {
            // `animation: none` — reset every accumulated field.
            anim.name = undefined;
            anim.durationMs = undefined;
            anim.delayMs = undefined;
            anim.timingFunction = undefined;
            anim.iterationCount = undefined;
            anim.direction = undefined;
            anim.fillMode = undefined;
            continue;
          }
          shorthand = typedAnimationShorthand(entry);
          if (!shorthand.name) {
            diagnostics.push({
              code: 'WF1006',
              message: `Cannot statically lower animation shorthand`,
            });
            continue;
          }
        }
        // CSS shorthand semantics: resets every longhand not specified.
        anim.name = shorthand.name;
        anim.durationMs = shorthand.durationMs;
        anim.delayMs = shorthand.delayMs;
        anim.timingFunction = shorthand.timingFunction;
        anim.iterationCount = shorthand.iterationCount;
        anim.direction = shorthand.direction;
        anim.fillMode = shorthand.fillMode;
        continue;
      }
      applyAnimationLonghand(anim, property, declaration, vars);
      continue;
    }

    // ---- transforms -------------------------------------------------------
    if (TRANSFORM_PROPERTIES.has(property)) {
      const value = declaration.unparsed
        ? transformFromTokens(property, substituteVars(declaration.value as CssToken[], vars) ?? [])
        : transformFromTyped(property, declaration.value);
      if (value && value.operations.length > 0) {
        out.push({
          property: 'transform',
          value,
          ...(declaration.important ? { important: true } : {}),
        });
      } else if (!value) {
        diagnostics.push({
          code: 'WF1005',
          message: `Cannot statically lower "${property}"`,
        });
      }
      // Empty operations = transform: none → no declaration.
      continue;
    }

    for (const lowered of lowerDeclaration(declaration, vars, ctx)) {
      if (declaration.important) lowered.important = true;
      out.push(lowered);
    }
  }

  const result: LoweredRule = { declarations: out };

  if (hasTransition) {
    result.transition = transition;
  }

  if (anim.name) {
    const frames = keyframes.get(anim.name);
    if (frames) {
      result.animation = {
        name: anim.name,
        keyframes: frames,
        ...(anim.durationMs !== undefined ? { duration: { ms: anim.durationMs } } : {}),
        ...(anim.delayMs !== undefined ? { delay: { ms: anim.delayMs } } : {}),
        ...(anim.timingFunction ? { timingFunction: anim.timingFunction } : {}),
        ...(anim.iterationCount !== undefined ? { iterationCount: anim.iterationCount } : {}),
        ...(anim.direction ? { direction: anim.direction } : {}),
        ...(anim.fillMode ? { fillMode: anim.fillMode } : {}),
      };
    } else {
      diagnostics.push({
        code: 'WF1006',
        message: `Animation "${anim.name}" references @keyframes not found in the stylesheet`,
      });
    }
  }

  return result;
}

/** Merge one animation longhand into the accumulating fields. */
function applyAnimationLonghand(
  anim: AnimationFields,
  property: string,
  declaration: CollectedDeclaration,
  vars: VariableMap,
): void {
  if (property === 'animation-name') {
    const token = firstTypedToken(declaration.value);
    const name = token ? typedString(token) : null;
    if (name) anim.name = name;
    return;
  }
  if (property === 'animation-duration' || property === 'animation-delay') {
    const ms = declaration.unparsed
      ? timeMsFromTokens(substituteVars(declaration.value as CssToken[], vars) ?? [])
      : timeMsFromTokens((declaration.value as unknown as CssToken[]) ?? []);
    if (ms !== null) {
      if (property === 'animation-duration') anim.durationMs = ms;
      else anim.delayMs = ms;
    }
    return;
  }
  if (property === 'animation-timing-function') {
    const easing = declaration.unparsed
      ? timingFunctionFromTokens(substituteVars(declaration.value as CssToken[], vars) ?? [])
      : lowerTimingFunction(declaration.value);
    if (easing) anim.timingFunction = easing;
    return;
  }
  if (property === 'animation-iteration-count') {
    const token = firstTypedToken(declaration.value);
    if (token?.type === 'infinite') {
      anim.iterationCount = 'infinite';
      return;
    }
    const num = token ? Number(typedString(token) ?? token.value) : NaN;
    if (!Number.isNaN(num) && num >= 0) anim.iterationCount = num;
    return;
  }
  if (property === 'animation-direction' || property === 'animation-fill-mode') {
    const token = firstTypedToken(declaration.value);
    const ident = token ? typedString(token) : null;
    if (
      property === 'animation-direction' &&
      (ident === 'normal' || ident === 'reverse' || ident === 'alternate' || ident === 'alternate-reverse')
    ) {
      anim.direction = ident;
    }
    if (
      property === 'animation-fill-mode' &&
      (ident === 'none' || ident === 'forwards' || ident === 'backwards' || ident === 'both')
    ) {
      anim.fillMode = ident;
    }
    return;
  }
}


/**
 * Lower a single collected declaration. Returns zero or more canonical
 * declarations (shorthands expand; unsupported declarations emit
 * diagnostics).
 */
export function lowerDeclaration(
  declaration: CollectedDeclaration,
  vars: VariableMap,
  ctx: LowerContext,
): LoweredDeclaration[] {
  const property = declaration.property;

  // ---- typed expansions -------------------------------------------------
  // Typed values go through expansion as-is; unparsed box shorthands that
  // resolve to a single static number are synthesized into the same shape.
  let typedValue: AnyRecord | null = null;
  if (
    !declaration.unparsed &&
    typeof declaration.value === 'object' &&
    declaration.value !== null
  ) {
    typedValue = declaration.value as AnyRecord;
  } else if (declaration.unparsed && BOX_SHORTHAND_PROPERTIES.has(property)) {
    const resolved = resolveNumeric(
      declaration.value as CssToken[],
      vars,
      ctx.diagnostics,
    );
    if (resolved) typedValue = synthesizeTypedValue(property, resolved);
  }

  if (typedValue) {
    const typed = typedValue;

    if (property === 'padding' || property === 'margin') {
      const shorthand: CanonicalProperty = property === 'padding' ? 'padding' : 'margin';
      const sides: [CanonicalProperty, CanonicalProperty, CanonicalProperty, CanonicalProperty] =
        property === 'padding'
          ? ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']
          : ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'];
      return lowerBox(typed, shorthand, sides, ctx, property);
    }
    if (
      property === 'padding-inline' ||
      property === 'padding-block' ||
      property === 'margin-inline' ||
      property === 'margin-block'
    ) {
      // Logical axis shorthands (Tailwind px-*/py-*/mx-*/my-*). RN's axis
      // keys assume LTR order, which is how the example apps layout.
      const prefix = property.startsWith('padding') ? 'padding' : 'margin';
      const start = lowerBoxValue(typed.inlineStart ?? typed.blockStart);
      const end = lowerBoxValue(typed.inlineEnd ?? typed.blockEnd);
      if (start === null || end === null) return [];
      if (!sameValue(start, end)) {
        // Unequal start/end → physical longhands (LTR order).
        return property.endsWith('inline')
          ? [
              { property: `${prefix}Left`, value: start },
              { property: `${prefix}Right`, value: end },
            ]
          : [
              { property: `${prefix}Top`, value: start },
              { property: `${prefix}Bottom`, value: end },
            ];
      }
      const target: CanonicalProperty = property.endsWith('inline')
        ? prefix === 'padding'
          ? 'paddingHorizontal'
          : 'marginHorizontal'
        : prefix === 'padding'
          ? 'paddingVertical'
          : 'marginVertical';
      return [{ property: target, value: start }];
    }
    if (property === 'border-width') {
      return lowerBox(
        typed,
        'borderWidth',
        ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'],
        ctx,
        property,
      );
    }
    if (property === 'border-radius') {
      const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
      const values = keys.map((key) => lowerRadiusValue(typed[key], ctx, property));
      if (values.some((v) => v === null)) return [];
      const [a, b, c, d] = values as [IRValue, IRValue, IRValue, IRValue];
      if (sameValue(a, b) && sameValue(b, c) && sameValue(c, d)) {
        return [{ property: 'borderRadius', value: a }];
      }
      return [
        { property: 'borderTopLeftRadius', value: a },
        { property: 'borderTopRightRadius', value: b },
        { property: 'borderBottomRightRadius', value: c },
        { property: 'borderBottomLeftRadius', value: d },
      ];
    }
    if (property === 'gap') {
      const row = typed.row && typeof typed.row === 'object' ? typedDimensionIR(typed.row as AnyRecord) : null;
      const column = typed.column && typeof typed.column === 'object' ? typedDimensionIR(typed.column as AnyRecord) : null;
      if (row === null || column === null) return [];
      if (sameValue(row, column)) return [{ property: 'gap', value: row }];
      return [
        { property: 'rowGap', value: row },
        { property: 'columnGap', value: column },
      ];
    }
    if (property === 'overflow') {
      const x = typedIdent((typed.x as AnyRecord) ?? {}) ?? null;
      const y = typedIdent((typed.y as AnyRecord) ?? {}) ?? null;
      if (x && x === y) return [{ property: 'overflow', value: { kind: 'string', value: x } }];
      // RN has a single overflow value; the horizontal one wins.
      if (x) return [{ property: 'overflow', value: { kind: 'string', value: x } }];
      return [];
    }
    if (property === 'flex') {
      const out: LoweredDeclaration[] = [];
      const grow = typedNumber((typed.grow as AnyRecord) ?? {});
      const shrink = typedNumber((typed.shrink as AnyRecord) ?? {});
      if (grow !== null) out.push({ property: 'flexGrow', value: { kind: 'number', value: grow } });
      if (shrink !== null) out.push({ property: 'flexShrink', value: { kind: 'number', value: shrink } });
      const basis = typed.basis && typeof typed.basis === 'object' ? typedDimensionIR(typed.basis as AnyRecord) : null;
      if (basis) out.push({ property: 'flexBasis', value: basis });
      return out;
    }
    if (property === 'text-decoration-line') {
      const line = typed.textDecorationLine;
      if (typeof line === 'string') {
        return [{ property: 'textDecorationLine', value: { kind: 'string', value: line } }];
      }
    }
    if (isColorValue(typed)) {
      const mapping = SIMPLE_PROPERTIES[property];
      const ir = lowerTypedColor(typed, ctx, property);
      if (!ir) return [];
      return [{ property: mapping?.target ?? property, value: ir }];
    }
  }

  // ---- per-property special handling -------------------------------------
  if (property === 'font-size') return lowerFontSize(declaration, vars, ctx);
  if (property === 'line-height') return lowerLineHeight(declaration, vars, ctx);
  if (property === 'letter-spacing') return lowerLetterSpacing(declaration, vars, ctx);
  if (property === 'font-weight') return lowerFontWeight(declaration, vars, ctx);
  if (property === 'font-family') return lowerFontFamily(declaration, vars, ctx);

  if (DEFERRED_PROPERTIES.has(property)) return [];

  // Tailwind's `border-t`/`border-r`/… emit a per-side style next to the
  // width. React Native only lowers an all-sides borderStyle, and its
  // default is already `solid` — so Tailwind's `solid` guard is a no-op we
  // can drop silently. Anything else would need a per-side borderStyle that
  // RN has no equivalent for.
  if (SIDE_BORDER_STYLE_PROPERTIES.has(property)) {
    return lowerSideBorderStyle(declaration, vars, ctx);
  }

  const mapping = SIMPLE_PROPERTIES[property];
  if (!mapping) {
    ctx.diagnostics.push({
      code: 'WF1003',
      message: `Property "${property}" has no React Native equivalent; skipped`,
    });
    return [];
  }

  if (declaration.unparsed) {
    const ir = lowerUnparsed(
      declaration.value as CssToken[],
      mapping.kind,
      vars,
      ctx,
      property,
    );
    if (!ir) return [];
    // Colors arriving as unparsed tokens (rare after var substitution of
    // modern syntax) are normalized here.
    if (mapping.kind === 'color' && ir.kind === 'string') {
      return [{ property: mapping.target, value: { kind: 'color', value: ir.value } }];
    }
    return [{ property: mapping.target, value: ir }];
  }

  const typed = declaration.value as AnyRecord;
  switch (mapping.kind) {
    case 'dimension': {
      const ir = typedDimensionIR(typed);
      if (!ir) {
        ctx.diagnostics.push({
          code: 'WF1005',
          message: `Cannot statically lower "${property}"`,
        });
        return [];
      }
      return [{ property: mapping.target, value: ir }];
    }
    case 'number': {
      const num = typedNumber(typed);
      if (num === null) {
        ctx.diagnostics.push({
          code: 'WF1005',
          message: `Cannot statically lower "${property}"`,
        });
        return [];
      }
      return [{ property: mapping.target, value: { kind: 'number', value: roundPx(num) } }];
    }
    case 'keyword': {
      let ident = typedKeyword(typed);
      if (ident !== null && ALIGNMENT_KEYWORD_TARGETS.has(mapping.target)) {
        if (ident === 'start') ident = 'flex-start';
        else if (ident === 'end') ident = 'flex-end';
      }
      if (ident === null) {
        ctx.diagnostics.push({
          code: 'WF1005',
          message: `Cannot statically lower "${property}"`,
        });
        return [];
      }
      return [{ property: mapping.target, value: { kind: 'string', value: ident } }];
    }
    case 'color': {
      const ir = lowerTypedColor(typed, ctx, property);
      if (!ir) return [];
      return [{ property: mapping.target, value: ir }];
    }
  }
}
