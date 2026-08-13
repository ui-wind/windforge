/**
 * Controlled runtime fallback parser for static spacing utilities.
 *
 * Build-time resolution is the primary path (generated artifact tables,
 * docs/specs/COMPILER_PIPELINE_SPEC.md §7-8). When a className token was not
 * present in source as a full literal (e.g. template compositions like
 * `p-${n}`), the runtime falls back to THIS parser — cached, deterministic,
 * observable in debug mode, and restricted to utilities whose semantics are
 * fully static. It returns null for everything else; callers then skip the
 * token exactly like an unknown class.
 *
 * Placement note: Tailwind parsing normally lives in the frontend package
 * (AI_AGENT_RULES Rule 2). This module is the spec-sanctioned exception
 * (docs/specs/TAILWIND_COMPILER_AND_PARSER_SPEC.md, Dynamic extraction:
 * "route the unresolved value to a controlled runtime resolver") and is
 * deliberately shaped as IR production, not CSS parsing: it emits
 * `DeclarationIR` values only, in the exact shape the build-time lowering
 * emits (packages/tailwind/src/css/lower.ts), so runtime-resolved styles are
 * byte-for-byte identical to build-resolved ones. Zero dependencies.
 *
 * The subset intentionally mirrors what the build pipeline can lower today:
 * Tailwind v4 emits `px-*` as `padding-inline` etc., which the build-side
 * lowering does not map yet — parsing those here would make the runtime more
 * capable than the build (divergence). They are rejected until build-side
 * lowering catches up.
 */
import type { CanonicalProperty } from './properties.js';
import type { IRValue } from './values.js';
import type { DeclarationIR } from './ir.js';

/**
 * Spacing multiplier in points. Tailwind v4 default: `--spacing: 0.25rem`
 * at 16px/rem → 4 points per step. Apps overriding `--spacing` get that
 * value at build time for scanned candidates; the fallback keeps 4.
 */
const SPACING_UNIT = 4;

/** Reject absurd multipliers (typos, hostile input) — real spacing caps way below this. */
const MAX_MULTIPLIER = 16384;

/** Declaration priority the build-time lowering assigns to these utilities. */
const FALLBACK_PRIORITY = 10;

type PropertyTable = {
  /** property or properties emitted, in declaration order */
  properties: CanonicalProperty[];
  /** allow negative values (e.g. -m-2) */
  allowsNegative: boolean;
  /** allow percent forms: `full`, fractions like `1/2` */
  allowsPercent: boolean;
};

/**
 * Explicit prefix table — no free-form parsing. Keys are the token prefixes
 * exactly as Tailwind spells them.
 */
const PREFIXES: Record<string, PropertyTable> = {
  p: { properties: ['padding'], allowsNegative: false, allowsPercent: false },
  pt: { properties: ['paddingTop'], allowsNegative: false, allowsPercent: false },
  pr: { properties: ['paddingRight'], allowsNegative: false, allowsPercent: false },
  pb: { properties: ['paddingBottom'], allowsNegative: false, allowsPercent: false },
  pl: { properties: ['paddingLeft'], allowsNegative: false, allowsPercent: false },
  ps: { properties: ['paddingInlineStart'], allowsNegative: false, allowsPercent: false },
  pe: { properties: ['paddingInlineEnd'], allowsNegative: false, allowsPercent: false },
  m: { properties: ['margin'], allowsNegative: true, allowsPercent: false },
  mt: { properties: ['marginTop'], allowsNegative: true, allowsPercent: false },
  mr: { properties: ['marginRight'], allowsNegative: true, allowsPercent: false },
  mb: { properties: ['marginBottom'], allowsNegative: true, allowsPercent: false },
  ml: { properties: ['marginLeft'], allowsNegative: true, allowsPercent: false },
  ms: { properties: ['marginInlineStart'], allowsNegative: true, allowsPercent: false },
  me: { properties: ['marginInlineEnd'], allowsNegative: true, allowsPercent: false },
  gap: { properties: ['gap'], allowsNegative: false, allowsPercent: false },
  'gap-x': { properties: ['columnGap'], allowsNegative: false, allowsPercent: false },
  'gap-y': { properties: ['rowGap'], allowsNegative: false, allowsPercent: false },
  w: { properties: ['width'], allowsNegative: false, allowsPercent: true },
  h: { properties: ['height'], allowsNegative: false, allowsPercent: true },
  size: { properties: ['width', 'height'], allowsNegative: false, allowsPercent: true },
  top: { properties: ['top'], allowsNegative: true, allowsPercent: false },
  right: { properties: ['right'], allowsNegative: true, allowsPercent: false },
  bottom: { properties: ['bottom'], allowsNegative: true, allowsPercent: false },
  left: { properties: ['left'], allowsNegative: true, allowsPercent: false },
};

/** Round like the build-side lowering to keep values byte-identical. */
function roundPoints(points: number): number {
  return Number((points).toFixed(4));
}

function scaleValue(multiplier: number): IRValue {
  return { kind: 'number', value: roundPoints(multiplier * SPACING_UNIT) };
}

function percentValue(percent: number): IRValue {
  return { kind: 'dimension', value: roundPoints(percent), unit: 'percent' };
}

/** Parse the value tail of a token: number, fraction `a/b`, or `full`. */
function parseTail(
  tail: string,
  table: PropertyTable,
): IRValue | null {
  if (tail === 'full') {
    return table.allowsPercent ? percentValue(100) : null;
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(tail);
  if (fraction) {
    if (!table.allowsPercent) return null;
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null;
    }
    return percentValue((numerator / denominator) * 100);
  }
  if (!/^\d+(\.\d+)?$/.test(tail)) return null;
  const multiplier = Number(tail);
  if (!Number.isFinite(multiplier) || multiplier > MAX_MULTIPLIER) return null;
  return scaleValue(multiplier);
}

/**
 * Parse one className token into static declarations, or null when the token
 * is outside the controlled subset. Only static IR value kinds are ever
 * constructed here.
 */
export function parseStaticUtility(token: string): DeclarationIR[] | null {
  // Variants and arbitrary values are never resolved at runtime.
  if (token.includes(':') || token.includes('[')) return null;

  let negative = false;
  let rest = token;
  if (rest.startsWith('-')) {
    negative = true;
    rest = rest.slice(1);
  }

  const separator = rest.lastIndexOf('-');
  if (separator <= 0) return null;
  const prefix = rest.slice(0, separator);
  const tail = rest.slice(separator + 1);
  if (!tail) return null;

  const table = PREFIXES[prefix];
  if (!table) return null;
  if (negative && !table.allowsNegative) return null;

  const value = parseTail(tail, table);
  if (!value) return null;
  const finalValue: IRValue =
    negative && value.kind === 'number' && value.value !== 0
      ? { ...value, value: -value.value }
      : value;

  const declarations: DeclarationIR[] = [];
  table.properties.forEach((property, index) => {
    declarations.push({
      property,
      value: finalValue,
      priority: FALLBACK_PRIORITY,
      sourceOrder: index,
    });
  });
  return declarations;
}
