import { describe, expect, it } from 'vitest';
import { resolveNumeric, substituteVars } from '../src/css/resolve.js';
import type { CssToken } from '../src/css/token-print.js';
import type { Diagnostic } from '../src/types.js';

/** Helper: calc(var(--spacing) * 4) as lightningcss would represent it. */
function spacingCalcTokens(multiplier: number): CssToken[] {
  return [
    {
      type: 'function',
      value: {
        name: 'calc',
        arguments: [
          { type: 'var', value: { name: { ident: '--spacing' }, fallback: null } },
          { type: 'white-space' },
          { type: 'delim', value: { value: '*' } },
          { type: 'white-space' },
          { type: 'number', value: { value: multiplier } },
        ],
      },
    },
  ];
}

const vars = new Map<string, CssToken[]>([
  ['--spacing', [{ type: 'length', value: { value: { unit: 'rem', value: 0.25 } } }]],
]);

describe('substituteVars', () => {
  it('substitutes known variables', () => {
    const resolved = substituteVars(spacingCalcTokens(4), vars);
    expect(resolved).not.toBeNull();
    const kinds = resolved?.map((t) => t.type);
    expect(kinds).not.toContain('var');
    // var() lives inside calc()'s arguments; substitution happens there.
    const calc = resolved?.[0] as { type: string; value: { arguments: CssToken[] } };
    expect(calc.value.arguments.map((t) => t.type)).toContain('length');
  });

  it('returns null for unknown variables without fallback', () => {
    const tokens: CssToken[] = [
      { type: 'var', value: { name: { ident: '--missing' }, fallback: null } },
    ];
    expect(substituteVars(tokens, vars)).toBeNull();
  });

  it('uses fallback for unknown variables', () => {
    const tokens: CssToken[] = [
      {
        type: 'var',
        value: {
          name: { ident: '--missing' },
          fallback: [{ type: 'number', value: { value: 2 } }],
        },
      },
    ];
    const resolved = substituteVars(tokens, vars);
    expect(resolved).toEqual([{ type: 'number', value: { value: 2 } }]);
  });

  it('guards against cyclic references', () => {
    const cyclic = new Map<string, CssToken[]>([
      ['--a', [{ type: 'var', value: { name: { ident: '--b' }, fallback: null } }]],
      ['--b', [{ type: 'var', value: { name: { ident: '--a' }, fallback: null } }]],
    ]);
    const tokens: CssToken[] = [
      { type: 'var', value: { name: { ident: '--a' }, fallback: null } },
    ];
    expect(substituteVars(tokens, cyclic)).toBeNull();
  });
});

describe('resolveNumeric', () => {
  const diagnostics: Diagnostic[] = [];

  it('resolves calc(var(--spacing) * 4) to 16px', () => {
    const result = resolveNumeric(spacingCalcTokens(4), vars, diagnostics);
    expect(result).toEqual({ value: 16, unit: 'px' });
  });

  it('resolves plain percentages', () => {
    const result = resolveNumeric(
      [{ type: 'percentage', value: { value: 50 } }],
      vars,
      diagnostics,
    );
    expect(result).toEqual({ value: 50, unit: 'percent' });
  });

  it('resolves unitless numbers', () => {
    const result = resolveNumeric(
      [{ type: 'number', value: { value: 1.5 } }],
      vars,
      diagnostics,
    );
    expect(result).toEqual({ value: 1.5, unit: 'none' });
  });

  it('emits a diagnostic for unresolvable values', () => {
    const local: Diagnostic[] = [];
    const result = resolveNumeric(
      [{ type: 'var', value: { name: { ident: '--nope' }, fallback: null } }],
      vars,
      local,
    );
    expect(result).toBeNull();
    expect(local.some((d) => d.code === 'WF1001')).toBe(true);
  });
});
