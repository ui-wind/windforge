/**
 * Lightningcss color objects → hex strings.
 *
 * Tailwind v4 emits modern color syntax (oklch, color-mix, …) which React
 * Native cannot parse, so every color is converted to #rrggbb[aa] at build
 * time via culori.
 */
import { formatHex8, parse } from 'culori';

type AnyRecord = Record<string, unknown>;

const COLOR_TYPES = new Set([
  'rgb',
  'hsl',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
]);

export function isColorValue(value: unknown): value is AnyRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    COLOR_TYPES.has((value as AnyRecord).type as string)
  );
}

/**
 * Serialize one color channel. lightningcss represents CSS `none` components
 * (e.g. `oklch(98.5% 0 none)` — Tailwind's achromatic zinc-50) as NaN once
 * the value crosses the N-API bridge; culori accepts the literal `none`.
 */
function channel(value: unknown): string {
  if (value === null || value === undefined) return 'none';
  if (typeof value === 'number' && Number.isNaN(value)) return 'none';
  return String(value);
}

/** Serialize a typed lightningcss color object to a CSS string culori can parse. */
function colorToCss(color: AnyRecord): string | null {
  const alpha = typeof color.alpha === 'number' ? color.alpha : 1;
  const alphaPart = alpha < 1 ? ` / ${alpha}` : '';
  switch (color.type) {
    case 'rgb': {
      const { r, g, b } = color as { r: number; g: number; b: number };
      return `rgb(${r} ${g} ${b}${alphaPart})`;
    }
    case 'hsl': {
      const { h, s, l } = color as { h: number; s: number; l: number };
      return `hsl(${channel(h)} ${s * 100}% ${l * 100}%${alphaPart})`;
    }
    case 'hwb': {
      const { h, w, b } = color as { h: number; w: number; b: number };
      return `hwb(${channel(h)} ${w * 100}% ${b * 100}%${alphaPart})`;
    }
    case 'lab': {
      const { l, a, b } = color as { l: number; a: number; b: number };
      return `lab(${l * 100}% ${channel(a)} ${channel(b)}${alphaPart})`;
    }
    case 'lch': {
      const { l, c, h } = color as { l: number; c: number; h: number };
      return `lch(${l * 100}% ${channel(c)} ${channel(h)}${alphaPart})`;
    }
    case 'oklab': {
      const { l, a, b } = color as { l: number; a: number; b: number };
      return `oklab(${channel(l)} ${channel(a)} ${channel(b)}${alphaPart})`;
    }
    case 'oklch': {
      const { l, c, h } = color as { l: number; c: number; h: number };
      return `oklch(${channel(l)} ${channel(c)} ${channel(h)}${alphaPart})`;
    }
    default:
      return null;
  }
}

/**
 * Convert any typed lightningcss color to `#rrggbb` / `#rrggbbaa`.
 * Returns null for colors that cannot be represented statically
 * (currentColor etc.) — the caller emits a diagnostic.
 */
export function colorToHex(color: AnyRecord): string | null {
  if (color.type === 'transparent') return '#00000000';
  if (color.type === 'currentcolor') return null;
  const css = colorToCss(color);
  if (css === null) return null;
  const parsed = parse(css);
  if (!parsed) return null;
  const hex = formatHex8(parsed);
  // Trim fully-opaque alpha suffix to keep output compact and hashes stable.
  return hex.endsWith('ff') ? hex.slice(0, 7) : hex;
}
