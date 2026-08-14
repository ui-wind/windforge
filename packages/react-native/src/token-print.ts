/**
 * Convert serialized lightningcss token arrays (from artifact.themes) into
 * CSS value strings for runtime variable resolution.
 *
 * The tailwind compiler serializes lightningcss Token objects into the
 * artifact as plain JSON. This module converts them back to usable CSS
 * strings without depending on lightningcss at runtime — only structural
 * knowledge of its serialization format.
 *
 * Handles: color, hash, ident, number/integer, percentage, dimension/length,
 * function (incl. var()), string, white-space, comma, delim, parenthesized.
 */

type TokenRecord = Record<string, unknown>;

/** Read the raw scalar out of a lightningcss token's value wrapper. */
function scalarValue(token: { type?: string; value?: unknown }): unknown {
  const record = token.value as TokenRecord | undefined;
  if (record && typeof record === 'object' && 'value' in record && !('unit' in record)) {
    return record.value;
  }
  return token.value;
}

/**
 * Serialize a lightningcss color object (`{type:'rgb', r,g,b,alpha}` etc.)
 * to a hex string (#rrggbb or #rrggbbaa). Returns null for colors that
 * cannot be represented statically.
 */
function colorToHex(color: TokenRecord): string | null {
  if (!color || typeof color.type !== 'string') return null;
  if (color.type === 'transparent') return '#00000000';
  if (color.type === 'currentcolor') return null;

  // All typed color spaces have an alpha channel defaulting to 1.
  const alpha = typeof color.alpha === 'number' ? color.alpha : 1;

  let r: number, g: number, b: number;

  switch (color.type) {
    case 'rgb': {
      r = clamp(Math.round(color.r as number));
      g = clamp(Math.round(color.g as number));
      b = clamp(Math.round(color.b as number));
      break;
    }
    // Other color spaces (hsl, hwb, lab, lch, oklab, oklch) are normalized
    // by lightningcss at build time when lowering utilities to IR values.
    // In practice, per-theme variable tables contain RGB because Tailwind
    // theme variables resolve through the same pipeline. Handle them by
    // converting via HSL→RGB if needed, but for now fall through to null
    // so the caller can report a diagnostic.
    default:
      return null;
  }

  const hex = '#' + toHex(r) + toHex(g) + toHex(b);
  if (alpha < 1) {
    const a = clamp(Math.round(alpha * 255));
    return hex + toHex(a);
  }
  return hex;
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(255, n));
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

/** Print one serialized lightningcss token to a CSS string fragment. */
export function printToken(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const token = raw as { type?: string; value?: unknown };
  if (typeof token.type !== 'string') return '';

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
      return String(scalarValue(token) ?? '');
    case 'percentage':
      return `${scalarValue(token)}%`;
    case 'length':
    case 'dimension': {
      const dim = scalarValue(token) as TokenRecord | undefined;
      if (dim && typeof dim.value === 'number' && typeof dim.unit === 'string') {
        return `${dim.value}${dim.unit}`;
      }
      return '';
    }
    case 'ident':
    case 'string':
      return String(scalarValue(token) ?? '');
    case 'hash':
      // Serialized as { type: 'hash', value: 'ef4444' }
      return `#${String(value ?? '')}`;
    case 'dashed-ident':
      // --custom-property name
      return String(scalarValue(token) ?? '');
    case 'color': {
      if (value && typeof value === 'object') {
        const hex = colorToHex(value);
        return hex ?? '';
      }
      return '';
    }
    case 'function': {
      const name = (value?.name as string) ?? '';
      const args = value?.arguments as unknown[] | undefined;
      return `${name}(${Array.isArray(args) ? args.map(printToken).join('') : ''})`;
    }
    case 'var': {
      const nameRecord = value?.name as TokenRecord | undefined;
      const varName = nameRecord?.ident ?? '';
      const fallback = value?.fallback as unknown[] | null | undefined;
      if (Array.isArray(fallback) && fallback.length > 0) {
        return `var(${varName}, ${fallback.map(printToken).join('')})`;
      }
      return `var(${varName})`;
    }
    case 'parenthesized': {
      const inner = Array.isArray(token.value) ? token.value : [];
      return `(${inner.map(printToken).join('')})`;
    }
    case 'token': {
      // Wrapped raw token: { type: 'token', value: { type: ..., value: ... } }
      if (value) return printToken(value);
      return '';
    }
    default:
      return '';
  }
}

/**
 * Convert a serialized token array from the artifact's themes table into a
 * single CSS value string. Trims whitespace from the result.
 *
 * Used by useCSSVariable and resolve.ts tokensToValue.
 */
export function tokensToString(tokens: unknown[]): string {
  if (!Array.isArray(tokens) || tokens.length === 0) return '';
  return tokens.map(printToken).join('').trim();
}
