/**
 * Print lightningcss value tokens back to CSS strings.
 *
 * lightningcss hands us token lists for values it did not fully parse (e.g.
 * `calc(var(--spacing) * 4)`). We print them for diagnostics and keep them
 * around as the source of truth for var()/calc() resolution.
 */
import { colorToHex, isColorValue } from './color.js';

// Loose structural types for lightningcss internal AST nodes, which are not
// covered by its public typings.
export type CssToken = {
  type: string;
  value?: unknown;
};

type TokenRecord = Record<string, unknown>;

/**
 * Lightningcss wraps nested tokens as `{ type: 'token', value: <token> }`.
 * Normalize recursively so the rest of the pipeline sees a uniform shape.
 */
export function normalizeTokens(tokens: CssToken[]): CssToken[] {
  return tokens.map(normalizeToken);
}

function normalizeToken(token: CssToken): CssToken {
  if (token.type === 'token' && token.value && typeof token.value === 'object') {
    return normalizeToken(token.value as CssToken);
  }
  const record = token.value as TokenRecord | undefined;
  if (token.type === 'function' && Array.isArray(record?.arguments)) {
    return {
      ...token,
      value: { ...record, arguments: normalizeTokens(record.arguments as CssToken[]) },
    };
  }
  if (token.type === 'var' && record) {
    const fallback = record.fallback;
    const normalizedFallback = Array.isArray(fallback)
      ? normalizeTokens(fallback as CssToken[])
      : null;
    return { ...token, value: { ...record, fallback: normalizedFallback } };
  }
  if (token.type === 'parenthesized' && Array.isArray(token.value)) {
    return { ...token, value: normalizeTokens(token.value as CssToken[]) };
  }
  return token;
}

/** Read the raw scalar out of a token value, which is sometimes `{ value }`
 * and sometimes the scalar itself depending on nesting depth. Dimension
 * records (`{ unit, value }`) are returned as-is: their `value` key is the
 * numeric amount, not another wrapper. */
export function scalarValue(token: CssToken): unknown {
  const record = token.value as TokenRecord | undefined;
  if (
    record &&
    typeof record === 'object' &&
    'value' in record &&
    !('unit' in record)
  ) {
    return record.value;
  }
  return token.value;
}

function printTokensInner(tokens: CssToken[]): string {
  return tokens.map(printToken).join('');
}

export function printToken(token: CssToken): string {
  const value = token.value as TokenRecord | undefined;
  switch (token.type) {
    case 'white-space':
      return ' ';
    case 'comma':
      return ',';
    case 'delim':
      return String(scalarValue(token) ?? '');
    case 'number':
    case 'integer':
    case 'percentage':
      return `${scalarValue(token)}${token.type === 'percentage' ? '%' : ''}`;
    case 'length':
    case 'dimension': {
      const dimension = scalarValue(token) as TokenRecord | undefined;
      return `${dimension?.value}${dimension?.unit}`;
    }
    case 'ident':
    case 'string':
      return String(scalarValue(token) ?? '');
    case 'function':
      return `${value?.name}(${printTokensInner((value?.arguments as CssToken[]) ?? [])})`;
    case 'var': {
      const name = (value?.name as TokenRecord)?.ident;
      const fallback = value?.fallback as CssToken[] | null | undefined;
      return fallback
        ? `var(${name}, ${printTokensInner(fallback)})`
        : `var(${name})`;
    }
    case 'color':
      return isColorValue(value) ? (colorToHex(value) ?? '<color>') : '<color>';
    case 'parenthesized':
      return `(${printTokensInner((value as unknown as CssToken[]) ?? [])})`;
    case 'token': {
      // Wrapped raw token: { type: 'token', value: { type: ..., value: ... } }
      if (value) return printToken(value as unknown as CssToken);
      return '';
    }
    default:
      return '';
  }
}

export function printTokens(tokens: CssToken[]): string {
  return printTokensInner(tokens).trim();
}
