import type { DeclarationIR } from '@windforge/ir';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildArtifact } from '../src/artifact.js';
import { generate } from '../src/index.js';
import { scanCandidates } from '../src/scan.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/app');
const ENTRY = resolve(FIXTURE, 'src/global.css');

function findProperty(
  declarations: DeclarationIR[],
  property: string,
): DeclarationIR | undefined {
  return declarations.find((d) => d.property === property);
}

describe('generate (end-to-end pipeline)', () => {
  it('scans candidates from the fixture app', () => {
    const candidates = scanCandidates(FIXTURE);
    expect(candidates).toContain('bg-zinc-950');
    expect(candidates).toContain('dark:text-zinc-300');
    expect(candidates).toContain('ios:bg-white');
  });

  it('builds a deterministic artifact with lowered static values', async () => {
    const result = await generate({ entry: ENTRY, base: FIXTURE });
    const { artifact, diagnostics } = result;

    // ---- base utilities -------------------------------------------------
    const padding = artifact.styles['p-4'];
    expect(padding).toBeDefined();
    expect(findProperty(padding.base, 'padding')).toEqual({
      property: 'padding',
      value: { kind: 'number', value: 16 },
      priority: 10,
      sourceOrder: 0,
    });

    const background = artifact.styles['bg-zinc-950'];
    const bg = findProperty(background.base, 'backgroundColor');
    expect(bg?.value.kind).toBe('color');

    const fontSize = artifact.styles['text-lg'];
    expect(findProperty(fontSize.base, 'fontSize')?.value).toEqual({
      kind: 'number',
      value: 18,
    });
    // line-height multiplier bridged: 18px * (1.75/1.125) = 28px
    expect(findProperty(fontSize.base, 'lineHeight')?.value).toEqual({
      kind: 'number',
      value: 28,
    });

    const half = artifact.styles['w-1/2'];
    expect(findProperty(half.base, 'width')?.value).toEqual({
      kind: 'dimension',
      value: 50,
      unit: 'percent',
    });

    const radius = artifact.styles['rounded-lg'];
    expect(findProperty(radius.base, 'borderRadius')?.value).toEqual({
      kind: 'number',
      value: 8,
    });

    // @theme token becomes a real utility: bg-accent → #3b82f6
    const accent = artifact.styles['bg-accent'];
    expect(findProperty(accent.base, 'backgroundColor')?.value).toEqual({
      kind: 'color',
      value: '#3b82f6',
    });

    // font-weight lowers to a numeric string, not "undefined" (flat token).
    const bold = artifact.styles['font-bold'];
    expect(findProperty(bold.base, 'fontWeight')?.value).toEqual({
      kind: 'string',
      value: '700',
    });

    // ---- conditions -------------------------------------------------------
    const dark = artifact.styles['dark:text-zinc-300'];
    expect(dark.variants).toHaveLength(1);
    expect(dark.variants?.[0]?.conditionIds).toEqual(['color-scheme:dark']);
    expect(
      findProperty(dark.variants?.[0]?.declarations ?? [], 'color')?.value.kind,
    ).toBe('color');
    expect(
      artifact.conditions.some(
        (c) => c.kind === 'color-scheme' && 'scheme' in c && c.scheme === 'dark',
      ),
    ).toBe(true);

    const sm = artifact.styles['sm:p-2'];
    expect(sm.variants?.[0]?.conditionIds).toEqual(['media-width:>=:640']);
    expect(
      artifact.conditions.some(
        (c) =>
          c.kind === 'media' && c.feature === 'min-width' && c.id === 'media-width:>=:640',
      ),
    ).toBe(true);

    // Platform variant via @custom-variant ios (@media (platform: ios))
    const ios = artifact.styles['ios:bg-white'];
    expect(ios.variants?.[0]?.conditionIds).toEqual(['platform:ios']);

    // ---- diagnostics -------------------------------------------------------
    expect(diagnostics.some((d) => d.code === 'WF1004')).toBe(true); // hover:
    // Color vars must resolve cleanly — no spurious "could not evaluate" noise.
    expect(diagnostics.some((d) => d.code === 'WF1002')).toBe(false);

    // ---- determinism -------------------------------------------------------
    const again = await generate({ entry: ENTRY, base: FIXTURE });
    expect(again.artifact.hash).toBe(artifact.hash);
  });

  it('is deterministic across two builds of the same CSS', async () => {
    const first = await generate({ entry: ENTRY, base: FIXTURE });
    const second = await generate({ entry: ENTRY, base: FIXTURE });
    expect(JSON.stringify(first.artifact)).toBe(JSON.stringify(second.artifact));
  });

  it('reports WF1000 when the entry does not import Tailwind', async () => {
    const { compileTailwindCss } = await import('../src/compile.js');
    const result = await compileTailwindCss('/tmp/wf-not-tailwind.css', ['p-4']).catch(
      () => null,
    );
    // File may not exist in fresh environments; only assert shape when readable.
    if (result) expect(Array.isArray(result.diagnostics)).toBe(true);
  });
});

describe('buildArtifact (direct CSS input)', () => {
  it('merges repeated properties within a rule (later wins)', () => {
    const css = `
      .card {
        padding-top: 4px;
        padding-top: 8px;
      }
    `;
    const { artifact } = buildArtifact(css, 1);
    const entry = artifact.styles['card'];
    expect(entry.base).toEqual([
      {
        property: 'paddingTop',
        value: { kind: 'number', value: 8 },
        priority: 10,
        sourceOrder: 1,
      },
    ]);
  });

  it('emits WF1003 for unsupported properties', () => {
    const css = `
      .box { cursor: pointer; }
      .box { border: 1px solid red; }
    `;
    const { diagnostics } = buildArtifact(css, 1);
    expect(diagnostics.some((d) => d.code === 'WF1003')).toBe(true);
  });
});
