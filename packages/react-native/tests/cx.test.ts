import { describe, expect, it } from 'vitest';
import { cn, cx } from '../src/cx.js';

describe('cx', () => {
  it('joins string inputs and normalizes whitespace', () => {
    expect(cx('p-4', 'mt-2')).toBe('p-4 mt-2');
    expect(cx('  p-4   mt-2 ')).toBe('p-4 mt-2');
  });

  it('drops falsy inputs', () => {
    expect(cx('p-4', false, null, undefined, true, 'mt-2')).toBe('p-4 mt-2');
    expect(cx(false, null, undefined)).toBe('');
  });

  it('accepts numbers', () => {
    expect(cx('z', 4)).toBe('z 4');
    expect(cx(0)).toBe('0');
  });

  it('applies object entries by truthiness', () => {
    expect(cx('base', { 'bg-emerald-500': true, 'opacity-50': false, off: null })).toBe(
      'base bg-emerald-500',
    );
  });

  it('flattens nested arrays', () => {
    expect(cx(['p-4', ['mt-2', { 'gap-2': true }]], 'w-4')).toBe('p-4 mt-2 gap-2 w-4');
  });

  it('normalizes whitespace across composed parts', () => {
    expect(cx('p-4  mt-2', [' gap-2 ', null], { 'w-4': true })).toBe('p-4 mt-2 gap-2 w-4');
  });

  it('returns empty string for no inputs', () => {
    expect(cx()).toBe('');
  });

  it('exports cn as an alias', () => {
    expect(cn('p-4', true && 'mt-2')).toBe('p-4 mt-2');
  });
});
