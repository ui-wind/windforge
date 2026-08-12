/**
 * CSS declaration → IR declaration lowering.
 *
 * Every value is resolved to a static IR value at build time (Strategy A):
 * var()/calc() resolved against the theme variable map, rem bridged at 16px,
 * modern colors converted to hex, logical/longhand properties expanded to the
 * canonical RN-compatible set.
 */
import type { CanonicalProperty, IRValue } from '@windforge/ir';
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

type AnyRecord = Record<string, unknown>;

export type LowerContext = {
  diagnostics: Diagnostic[];
  /** font-size (px) seen earlier in the same rule; line-height multipliers
   * and em units resolve against it (falls back to the 16px base). */
  fontSizePx: number | null;
};

export type LoweredDeclaration = {
  property: CanonicalProperty;
  value: IRValue;
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

/** Shorthands that expand into typed multi-side values. Unparsed (var/calc)
 * variants of these are resolved to a single number and synthesized into the
 * same typed shape so one expansion path handles both. */
const BOX_SHORTHAND_PROPERTIES = new Set([
  'padding',
  'margin',
  'border-width',
  'border-radius',
  'gap',
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

/** Extract a px value from a typed length-percentage. Percentages return null. */
function typedLengthPx(value: AnyRecord): number | null {
  const inner = value.value as AnyRecord | undefined;
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

function typedDimensionIR(value: AnyRecord): IRValue | null {
  const percent = typedPercentage(value);
  if (percent !== null) {
    return { kind: 'dimension', value: percent, unit: 'percent' };
  }
  const px = typedLengthPx(value);
  if (px !== null) return { kind: 'number', value: roundPx(px) };
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
      const values = keys.map((key) => {
        const side = typed[key];
        return side && typeof side === 'object' ? typedDimensionIR(side as AnyRecord) : null;
      });
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
      const ident = typedIdent(typed);
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
