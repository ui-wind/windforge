/**
 * Build-time var()/calc() resolution.
 *
 * Strategy A (decided for MVP): resolve all `var()` references and evaluate
 * all `calc()` expressions at build time, emitting static IR values. No
 * runtime variable references. rem is bridged at 16px; unitless results stay
 * unitless (multipliers for line-height etc.).
 */
import type { Diagnostic } from '../types.js';
import { printTokens, scalarValue, type CssToken } from './token-print.js';

export type VariableMap = Map<string, CssToken[]>;

export const REM_PX = 16;

export type ResolvedNumeric = {
  value: number;
  unit: 'px' | 'percent' | 'none';
};

type TokenRecord = Record<string, unknown>;

function asRecord(value: unknown): TokenRecord {
  return value as TokenRecord;
}

/** True when the token list contains only whitespace. */
function isBlank(tokens: CssToken[]): boolean {
  return tokens.every((t) => t.type === 'white-space');
}

/**
 * Substitute var() references from the variable map. Returns null when a
 * reference cannot be resolved (unknown variable without fallback).
 */
export function substituteVars(
  tokens: CssToken[],
  vars: VariableMap,
  depth = 0,
): CssToken[] | null {
  if (depth > 16) return null; // guard against cyclic references
  const out: CssToken[] = [];
  for (const token of tokens) {
    if (token.type !== 'var') {
      // Recurse into nested token lists (function arguments, fallbacks).
      if (token.type === 'function') {
        const record = asRecord(token.value);
        const args = record.arguments as CssToken[] | undefined;
        if (args) {
          const resolved = substituteVars(args, vars, depth + 1);
          if (resolved === null) return null;
          out.push({
            type: 'function',
            value: { ...record, arguments: resolved },
          });
          continue;
        }
      }
      out.push(token);
      continue;
    }
    const record = asRecord(token.value);
    const name = (asRecord(record.name)?.ident as string) ?? '';
    const definition = vars.get(name);
    if (definition && !isBlank(definition)) {
      const resolved = substituteVars(definition, vars, depth + 1);
      if (resolved === null) return null;
      out.push(...resolved);
      continue;
    }
    const fallback = record.fallback as CssToken[] | null | undefined;
    if (fallback) {
      const resolved = substituteVars(fallback, vars, depth + 1);
      if (resolved === null) return null;
      out.push(...resolved);
      continue;
    }
    return null;
  }
  return out;
}

/** Convert a dimension token to resolved px. Returns null for unsupported units. */
function dimensionToPx(value: TokenRecord): number | null {
  const unit = value.unit as string;
  const amount = value.value as number;
  if (unit === 'px') return amount;
  if (unit === 'rem') return amount * REM_PX;
  return null;
}

/**
 * Evaluate a single (already var-substituted) token to a static value.
 * Used by transform lowering for multi-value properties where per-value
 * `resolveNumeric` does not apply. Returns null for anything non-static.
 */
export function resolveTokenValue(token: CssToken): ResolvedNumeric | null {
  const record = asRecord(token.value);
  switch (token.type) {
    case 'number':
    case 'integer':
      return { value: Number(scalarValue(token)), unit: 'none' };
    case 'percentage': {
      const num = Number(scalarValue(token));
      // lightningcss normalizes percentage tokens to fractions (1.05 = 105%);
      // callers apply the unit semantics.
      return Number.isNaN(num) ? null : { value: num, unit: 'percent' };
    }
    case 'length':
    case 'dimension': {
      const px = dimensionToPx(asRecord(scalarValue(token)));
      return px === null ? null : { value: px, unit: 'px' };
    }
    case 'function': {
      if ((record.name as string) !== 'calc') return null;
      const args = record.arguments as CssToken[] | undefined;
      return args ? CalcParser.parse(args) : null;
    }
    case 'parenthesized': {
      const inner = record.value as CssToken[] | undefined;
      return inner ? CalcParser.parse(inner) : null;
    }
    default:
      return null;
  }
}

function combineUnits(
  a: ResolvedNumeric,
  b: ResolvedNumeric,
  op: '+' | '-' | '*' | '/',
): 'px' | 'percent' | 'none' | null {
  if (op === '+' || op === '-') {
    if (a.unit === b.unit) return a.unit;
    // Allow mixing a unitless zero with a unit.
    if (a.value === 0 && a.unit === 'none') return b.unit;
    if (b.value === 0 && b.unit === 'none') return a.unit;
    return null;
  }
  if (op === '*') {
    if (a.unit !== 'none' && b.unit !== 'none') return null;
    return a.unit !== 'none' ? a.unit : b.unit;
  }
  // Division: divisor must be unitless.
  if (b.unit !== 'none') return null;
  return a.unit;
}

class CalcParser {
  private index = 0;
  constructor(private readonly tokens: CssToken[]) {}

  static parse(tokens: CssToken[]): ResolvedNumeric | null {
    const parser = new CalcParser(tokens);
    const result = parser.parseExpression();
    parser.skipWhitespace();
    if (result === null || parser.index < parser.tokens.length) return null;
    return result;
  }

  private peek(): CssToken | undefined {
    return this.tokens[this.index];
  }

  private skipWhitespace(): void {
    while (this.peek()?.type === 'white-space') this.index += 1;
  }

  private parseExpression(): ResolvedNumeric | null {
    let left = this.parseTerm();
    if (left === null) return null;
    for (;;) {
      this.skipWhitespace();
      const token = this.peek();
      if (token?.type !== 'delim' || scalarValue(token) !== '+' && scalarValue(token) !== '-') {
        return left;
      }
      const op = scalarValue(token) as '+' | '-';
      this.index += 1;
      const right = this.parseTerm();
      if (right === null) return null;
      const unit = combineUnits(left, right, op);
      if (unit === null) return null;
      left = {
        value: op === '+' ? left.value + right.value : left.value - right.value,
        unit,
      };
    }
  }

  private parseTerm(): ResolvedNumeric | null {
    let left = this.parseFactor();
    if (left === null) return null;
    for (;;) {
      this.skipWhitespace();
      const token = this.peek();
      if (
        token?.type !== 'delim' ||
        (scalarValue(token) !== '*' && scalarValue(token) !== '/')
      ) {
        return left;
      }
      const op = scalarValue(token) as '*' | '/';
      this.index += 1;
      const right = this.parseFactor();
      if (right === null) return null;
      const unit = combineUnits(left, right, op);
      if (unit === null) return null;
      if (op === '/' && right.value === 0) return null;
      left = {
        value: op === '*' ? left.value * right.value : left.value / right.value,
        unit,
      };
    }
  }

  private parseFactor(): ResolvedNumeric | null {
    this.skipWhitespace();
    const token = this.peek();
    if (!token) return null;
    const record = asRecord(token.value);
    switch (token.type) {
      case 'number':
        this.index += 1;
        return { value: Number(scalarValue(token)), unit: 'none' };
      case 'percentage':
        this.index += 1;
        return { value: Number(scalarValue(token)), unit: 'percent' };
      case 'length':
      case 'dimension': {
        this.index += 1;
        const px = dimensionToPx(asRecord(scalarValue(token)));
        return px === null ? null : { value: px, unit: 'px' };
      }
      case 'function': {
        if ((record.name as string) !== 'calc') return null;
        this.index += 1;
        const args = record.arguments as CssToken[] | undefined;
        return args ? CalcParser.parse(args) : null;
      }
      case 'parenthesized': {
        this.index += 1;
        const inner = record.value as CssToken[] | undefined;
        return inner ? CalcParser.parse(inner) : null;
      }
      default:
        return null;
    }
  }
}

/**
 * Resolve an unparsed token list to a numeric value: substitute vars, then
 * evaluate calc()/single values. Returns null (with a diagnostic) when the
 * value cannot be resolved statically.
 */
export function resolveNumeric(
  tokens: CssToken[],
  vars: VariableMap,
  diagnostics: Diagnostic[],
): ResolvedNumeric | null {
  const substituted = substituteVars(tokens, vars);
  if (substituted === null) {
    diagnostics.push({
      code: 'WF1001',
      message: `Unresolvable var() reference in "${printTokens(tokens)}"`,
    });
    return null;
  }
  const significant = substituted.filter((t) => t.type !== 'white-space');
  if (significant.length === 1) {
    const only = significant[0] as CssToken;
    const record = asRecord(only.value);
    switch (only.type) {
      case 'number':
        return { value: Number(scalarValue(only)), unit: 'none' };
      case 'percentage':
        return { value: Number(scalarValue(only)), unit: 'percent' };
      case 'length':
      case 'dimension': {
        const px = dimensionToPx(asRecord(scalarValue(only)));
        return px === null ? null : { value: px, unit: 'px' };
      }
      case 'function': {
        if ((record.name as string) === 'calc') {
          const args = record.arguments as CssToken[] | undefined;
          const result = args ? CalcParser.parse(args) : null;
          if (result === null) {
            diagnostics.push({
              code: 'WF1002',
              message: `Could not evaluate "${printTokens(tokens)}"`,
            });
          }
          return result;
        }
        break;
      }
      default:
        break;
    }
  }
  diagnostics.push({
    code: 'WF1002',
    message: `Could not evaluate "${printTokens(tokens)}" as a static value`,
  });
  return null;
}
