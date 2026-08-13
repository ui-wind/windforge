/**
 * @windforge/extension-sdk — descriptor builders, CSS lowering, validation.
 *
 * Golden expectations mirror the literal forms already proven in
 * apps/example/src/global.css (`@custom-variant ios (@media (platform: ios));`,
 * `@theme { --color-accent: ... }`).
 */
import { describe, expect, it } from 'vitest';
import {
  definePreset,
  defineTokens,
  defineUtility,
  defineVariant,
  renderExtensions,
  type TokensDescriptor,
} from '../src/index.js';

describe('descriptor builders', () => {
  it('returns plain serializable descriptors', () => {
    expect(defineUtility({ name: 'glass', css: 'opacity: 0.8;' })).toEqual({
      kind: 'utility',
      name: 'glass',
      css: 'opacity: 0.8;',
    });
    expect(defineVariant({ name: 'land', media: '(orientation: landscape)' })).toEqual({
      kind: 'variant',
      name: 'land',
      media: '(orientation: landscape)',
    });
    expect(defineTokens({ colors: { brand: '#22c55e' } })).toEqual({
      kind: 'tokens',
      colors: { brand: '#22c55e' },
    });
    const preset = definePreset({
      name: 'brand-kit',
      utilities: [defineUtility({ name: 'brand', css: 'color: red;' })],
    });
    expect(preset.kind).toBe('preset');
    expect(preset.utilities).toHaveLength(1);
  });
});

describe('renderExtensions — golden output', () => {
  it('lowers utilities to @utility', () => {
    const { css, diagnostics } = renderExtensions([
      defineUtility({ name: 'glass', css: 'opacity: 0.8;\nborder-radius: 8px;' }),
    ]);
    expect(diagnostics).toEqual([]);
    expect(css).toBe('@utility glass {\n  opacity: 0.8;\n  border-radius: 8px;\n}');
  });

  it('lowers variants to @custom-variant (global.css literal form)', () => {
    const { css, diagnostics } = renderExtensions([
      defineVariant({ name: 'ios', media: '(platform: ios)' }),
    ]);
    expect(diagnostics).toEqual([]);
    expect(css).toBe('@custom-variant ios (@media (platform: ios));');
  });

  it('accepts every evaluable media feature', () => {
    const medias = [
      '(prefers-color-scheme: dark)',
      '(orientation: landscape)',
      '(platform: android)',
      '(layout-direction: rtl)',
      '(width >= 640px)',
      '(min-width: 640px)',
      '(platform: ios) and (orientation: landscape)',
    ];
    for (const media of medias) {
      const { diagnostics } = renderExtensions([defineVariant({ name: 'v', media })]);
      expect(diagnostics, media).toEqual([]);
    }
  });

  it('lowers tokens to @theme (global.css literal form)', () => {
    const { css, diagnostics } = renderExtensions([
      defineTokens({ colors: { accent: '#3b82f6' }, animate: { 'spin-slow': 'spin 3s linear infinite' } }),
    ]);
    expect(diagnostics).toEqual([]);
    expect(css).toBe(
      '@theme {\n  --color-accent: #3b82f6;\n  --animate-spin-slow: spin 3s linear infinite;\n}',
    );
  });

  it('orders output: themes, variants, utilities, raw css', () => {
    const { css } = renderExtensions([
      defineUtility({ name: 'u', css: 'opacity: 1;' }),
      defineVariant({ name: 'v', media: '(platform: ios)' }),
      defineTokens({ colors: { t: '#fff' } }),
    ]);
    expect(css).toBe(
      '@theme {\n  --color-t: #fff;\n}\n' +
        '@custom-variant v (@media (platform: ios));\n' +
        '@utility u {\n  opacity: 1;\n}',
    );
  });

  it('renders preset members with origin-attributed diagnostics', () => {
    const preset = definePreset({
      name: 'brand-kit',
      utilities: [defineUtility({ name: 'kit', css: 'color: teal;' })],
      variants: [defineVariant({ name: 'kitdark', media: '(prefers-color-scheme: dark)' })],
      tokens: [defineTokens({ colors: { kit: '#008080' } })],
      css: '@keyframes kit-spin { to { transform: rotate(360deg); } }',
    });
    const { css, diagnostics } = renderExtensions([preset]);
    expect(diagnostics).toEqual([]);
    expect(css).toContain('--color-kit: #008080;');
    expect(css).toContain('@custom-variant kitdark (@media (prefers-color-scheme: dark));');
    expect(css).toContain('@utility kit {');
    expect(css).toContain('@keyframes kit-spin');
  });

  it('is deterministic for identical input', () => {
    const descriptors = [
      defineUtility({ name: 'a', css: 'opacity: 1;' }),
      defineTokens({ colors: { b: '#000' } }),
      defineVariant({ name: 'c', media: '(platform: web)' }),
    ];
    expect(renderExtensions(descriptors).css).toBe(renderExtensions(descriptors).css);
  });
});

describe('renderExtensions — validation (WF3xxx)', () => {
  it('WF3001 rejects invalid names', () => {
    for (const name of ['Glass', '-glass', 'glass/2', 'glass.2', '']) {
      const { css, diagnostics } = renderExtensions([
        defineUtility({ name, css: 'opacity: 1;' }),
      ]);
      expect(diagnostics.map((d) => d.code), name).toEqual(['WF3001']);
      expect(css).toBe('');
    }
  });

  it('WF3001 also applies to token keys and preset members', () => {
    const { diagnostics } = renderExtensions([
      defineTokens({ colors: { 'bad name': '#fff' } }),
      definePreset({ name: 'kit', utilities: [defineUtility({ name: 'Bad', css: 'x: 1;' })] }) as never,
    ]);
    expect(diagnostics.map((d) => d.code).sort()).toEqual(['WF3001', 'WF3001']);
    expect(diagnostics[1]?.message).toContain('preset "kit"');
  });

  it('WF3002 rejects empty bodies and values', () => {
    expect(renderExtensions([defineUtility({ name: 'empty', css: '  ' })]).diagnostics.map((d) => d.code)).toEqual([
      'WF3002',
    ]);
    expect(
      renderExtensions([defineTokens({ colors: { blank: '   ' } })]).diagnostics.map((d) => d.code),
    ).toEqual(['WF3002']);
  });

  it('WF3003 rejects @import in utility and preset css', () => {
    const viaUtility = renderExtensions([
      defineUtility({ name: 'imp', css: '@import "./other.css"; opacity: 1;' }),
    ]);
    expect(viaUtility.diagnostics.map((d) => d.code)).toEqual(['WF3003']);
    expect(viaUtility.css).toBe('');

    const viaPreset = renderExtensions([
      definePreset({ name: 'kit', css: '@import "tailwindcss";' }),
    ]);
    expect(viaPreset.diagnostics.map((d) => d.code)).toEqual(['WF3003']);
  });

  it('WF3004 rejects unevaluable or malformed media queries', () => {
    const cases: Array<[string, string]> = [
      ['hover', '(hover: hover)'],
      ['or-query', '(platform: ios), (platform: android)'],
      ['empty', ''],
      ['no-condition', 'screen'],
    ];
    for (const [label, media] of cases) {
      const { diagnostics } = renderExtensions([defineVariant({ name: 'v', media })]);
      expect(diagnostics.map((d) => d.code), label).toEqual(['WF3004']);
    }
  });

  it('WF3005 rejects unknown token namespaces', () => {
    const bogus = { kind: 'tokens', shadows: { sm: '0 1px 2px black' } } as unknown as TokensDescriptor;
    const { css, diagnostics } = renderExtensions([bogus]);
    expect(diagnostics.map((d) => d.code)).toEqual(['WF3005']);
    expect(css).toBe('');
  });

  it('reports all problems, keeping valid fragments', () => {
    const { css, diagnostics } = renderExtensions([
      defineUtility({ name: 'ok', css: 'opacity: 1;' }),
      defineUtility({ name: 'Bad', css: 'opacity: 0;' }),
      defineVariant({ name: 'bad', media: '(hover: hover)' }),
      defineTokens({ colors: { good: '#fff' } }),
    ]);
    expect(diagnostics.map((d) => d.code).sort()).toEqual(['WF3001', 'WF3004']);
    expect(css).toContain('@utility ok');
    expect(css).toContain('--color-good: #fff;');
    expect(css).not.toContain('bad');
  });
});
