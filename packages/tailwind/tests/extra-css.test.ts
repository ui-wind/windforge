/**
 * extraCss injection seam — the Tailwind package stays unaware of
 * @windforge/extension-sdk; @windforge/metro renders descriptors to CSS text
 * and passes it through GenerateOptions.extraCss.
 */
import type { DeclarationIR } from '@windforge/ir';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileTailwindCss } from '../src/compile.js';
import { generate } from '../src/index.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/ext');
const ENTRY = resolve(FIXTURE, 'src/global.css');

/** Rendered output shape of renderExtensions([utility, tokens, variant]). */
const EXTENSION_CSS = [
  '@theme {',
  '  --color-brand: #22c55e;',
  '}',
  '@custom-variant land (@media (orientation: landscape));',
  '@utility glass {',
  '  opacity: 0.8;',
  '}',
].join('\n');

function findProperty(declarations: DeclarationIR[], property: string): DeclarationIR | undefined {
  return declarations.find((d) => d.property === property);
}

describe('generate({ extraCss })', () => {
  it('extension classes reach the artifact through the injection seam', async () => {
    const { artifact, diagnostics } = await generate({
      entry: ENTRY,
      base: FIXTURE,
      extraCss: EXTENSION_CSS,
    });
    expect(diagnostics).toEqual([]);

    // defineUtility → static declarations.
    const glass = artifact.styles['glass'];
    expect(glass).toBeDefined();
    expect(findProperty(glass.base, 'opacity')?.value).toEqual({ kind: 'number', value: 0.8 });

    // defineTokens → themed utility.
    const brand = artifact.styles['bg-brand'];
    expect(brand).toBeDefined();
    expect(findProperty(brand.base, 'backgroundColor')?.value).toEqual({
      kind: 'color',
      value: '#22c55e',
    });

    // defineVariant → condition-gated entry + conditions table.
    const land = artifact.styles['land:bg-emerald-500'];
    expect(land).toBeDefined();
    expect(land.variants?.[0]?.conditionIds).toEqual(['orientation:landscape']);
    expect(artifact.conditions.some((c) => c.id === 'orientation:landscape')).toBe(true);
  });

  it('matches the artifact without extraCss when the seam is unused', async () => {
    const withInjection = await generate({ entry: ENTRY, base: FIXTURE, extraCss: EXTENSION_CSS });
    const baseline = await generate({ entry: ENTRY, base: FIXTURE });
    expect(withInjection.artifact.hash).not.toBe(baseline.artifact.hash);
    // Baseline still resolves non-extension classes identically.
    expect(baseline.artifact.styles['glass']).toBeUndefined();
  });
});

describe('compileTailwindCss({ extraCss })', () => {
  it('WF1000 still validates the entry file only — injected CSS cannot satisfy it', async () => {
    const plain = resolve(FIXTURE, 'src/plain.css');
    const { css, diagnostics } = await compileTailwindCss(plain, [], {
      extraCss: '@import "tailwindcss";',
    });
    expect(css).toBe('');
    expect(diagnostics.map((d) => d.code)).toEqual(['WF1000']);
  });

  it('WF1007 reports malformed extension CSS as a diagnostic', async () => {
    // oxide throws for invalid custom-variant names (uppercase); the seam
    // must surface that as a diagnostic instead of letting it throw.
    const { css, diagnostics } = await compileTailwindCss(ENTRY, ['p-4'], {
      extraCss: '@custom-variant LAND (@media (orientation: landscape));',
    });
    expect(css).toBe('');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('WF1007');
    expect(diagnostics[0]?.message).toContain('invalid variant name');
  });
});
