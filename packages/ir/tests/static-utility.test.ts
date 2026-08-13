import { describe, expect, it } from 'vitest';
import { parseStaticUtility } from '../src/static-utility.js';

describe('parseStaticUtility', () => {
  it('emits the exact artifact shape for p-4', () => {
    // Truth from apps/example/.windforge/generated.js (build-time lowering).
    expect(parseStaticUtility('p-4')).toEqual([
      { property: 'padding', value: { kind: 'number', value: 16 }, priority: 10, sourceOrder: 0 },
    ]);
  });

  it('scales decimal multipliers (n * 4 points)', () => {
    expect(parseStaticUtility('p-1.5')).toEqual([
      { property: 'padding', value: { kind: 'number', value: 6 }, priority: 10, sourceOrder: 0 },
    ]);
    expect(parseStaticUtility('p-4.25')).toEqual([
      { property: 'padding', value: { kind: 'number', value: 17 }, priority: 10, sourceOrder: 0 },
    ]);
    expect(parseStaticUtility('m-0')).toEqual([
      { property: 'margin', value: { kind: 'number', value: 0 }, priority: 10, sourceOrder: 0 },
    ]);
  });

  it('parses per-side padding and logical longhands', () => {
    expect(parseStaticUtility('pt-2')?.[0]).toMatchObject({
      property: 'paddingTop',
      value: { kind: 'number', value: 8 },
    });
    expect(parseStaticUtility('ms-2')?.[0]).toMatchObject({
      property: 'marginInlineStart',
      value: { kind: 'number', value: 8 },
    });
    expect(parseStaticUtility('pe-3')?.[0]).toMatchObject({
      property: 'paddingInlineEnd',
      value: { kind: 'number', value: 12 },
    });
  });

  it('allows negatives for margin and positions only', () => {
    expect(parseStaticUtility('-m-2')).toEqual([
      { property: 'margin', value: { kind: 'number', value: -8 }, priority: 10, sourceOrder: 0 },
    ]);
    expect(parseStaticUtility('-top-2')?.[0]).toMatchObject({
      property: 'top',
      value: { kind: 'number', value: -8 },
    });
    expect(parseStaticUtility('-p-4')).toBeNull();
    expect(parseStaticUtility('-gap-2')).toBeNull();
    expect(parseStaticUtility('-w-4')).toBeNull();
  });

  it('maps gap utilities', () => {
    expect(parseStaticUtility('gap-2')?.[0]).toMatchObject({ property: 'gap', value: { kind: 'number', value: 8 } });
    expect(parseStaticUtility('gap-x-2')?.[0]).toMatchObject({ property: 'columnGap', value: { kind: 'number', value: 8 } });
    expect(parseStaticUtility('gap-y-3')?.[0]).toMatchObject({ property: 'rowGap', value: { kind: 'number', value: 12 } });
  });

  it('emits two declarations for size-*', () => {
    expect(parseStaticUtility('size-8')).toEqual([
      { property: 'width', value: { kind: 'number', value: 32 }, priority: 10, sourceOrder: 0 },
      { property: 'height', value: { kind: 'number', value: 32 }, priority: 10, sourceOrder: 1 },
    ]);
  });

  it('parses percent forms for w/h/size only', () => {
    expect(parseStaticUtility('w-1/2')).toEqual([
      { property: 'width', value: { kind: 'dimension', value: 50, unit: 'percent' }, priority: 10, sourceOrder: 0 },
    ]);
    expect(parseStaticUtility('w-full')?.[0]).toMatchObject({
      value: { kind: 'dimension', value: 100, unit: 'percent' },
    });
    expect(parseStaticUtility('h-2/3')?.[0]).toMatchObject({
      value: { kind: 'dimension', value: 66.6667, unit: 'percent' },
    });
    expect(parseStaticUtility('p-full')).toBeNull();
    expect(parseStaticUtility('p-1/2')).toBeNull();
    expect(parseStaticUtility('w-2/0')).toBeNull();
  });

  it('rejects tokens outside the controlled subset', () => {
    // Two-value shorthands the build-side lowering does not map yet
    // (Tailwind v4 emits padding-inline/padding-block/margin-inline).
    expect(parseStaticUtility('px-3')).toBeNull();
    expect(parseStaticUtility('py-2')).toBeNull();
    expect(parseStaticUtility('mx-2')).toBeNull();
    expect(parseStaticUtility('my-4')).toBeNull();
    expect(parseStaticUtility('inset-0')).toBeNull();
    expect(parseStaticUtility('inset-x-2')).toBeNull();
    // variants, arbitrary values, non-spacing utilities, malformed input
    expect(parseStaticUtility('dark:p-4')).toBeNull();
    expect(parseStaticUtility('p-[13px]')).toBeNull();
    expect(parseStaticUtility('bg-red-500')).toBeNull();
    expect(parseStaticUtility('rotate-45')).toBeNull();
    expect(parseStaticUtility('p-')).toBeNull();
    expect(parseStaticUtility('-p-')).toBeNull();
    expect(parseStaticUtility('p-4x')).toBeNull();
    expect(parseStaticUtility('p')).toBeNull();
    expect(parseStaticUtility('')).toBeNull();
    expect(parseStaticUtility('p-4 p-2')).toBeNull();
    // sanity cap
    expect(parseStaticUtility('p-999999999')).toBeNull();
    expect(parseStaticUtility('p-16384')).not.toBeNull();
  });
});
