import { describe, expect, it } from 'vitest';
import { colorToHex, isColorValue } from '../src/css/color.js';

describe('colorToHex', () => {
  it('converts oklch to hex', () => {
    // Tailwind zinc-950: oklch(0.141 0.005 285.823)
    const hex = colorToHex({ type: 'oklch', l: 0.141, c: 0.005, h: 285.823 });
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('converts rgb to hex and trims opaque alpha', () => {
    expect(colorToHex({ type: 'rgb', r: 255, g: 0, b: 0, alpha: 1 })).toBe('#ff0000');
  });

  it('keeps fractional alpha as 8-digit hex', () => {
    const hex = colorToHex({ type: 'rgb', r: 0, g: 0, b: 255, alpha: 0.5 });
    expect(hex).toMatch(/^#0000ff[0-9a-f]{2}$/);
    expect(hex).not.toMatch(/ff$/);
  });

  it('maps transparent to fully-opaque-zero hex', () => {
    expect(colorToHex({ type: 'transparent' })).toBe('#00000000');
  });

  it('returns null for currentcolor', () => {
    expect(colorToHex({ type: 'currentcolor' })).toBeNull();
  });

  it('detects color values via isColorValue', () => {
    expect(isColorValue({ type: 'oklch' })).toBe(true);
    expect(isColorValue({ type: 'ident' })).toBe(false);
  });
});
