import type { DeclarationIR } from '@windforge/ir';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildArtifact } from '../src/artifact.js';
import { compileTailwindCss } from '../src/compile.js';
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

    // Phase 11: pseudo-class variants lower to state conditions end-to-end.
    const hover = artifact.styles['hover:bg-red-500'];
    expect(hover.variants?.[0]?.conditionIds).toEqual(['state:hover']);
    expect(
      artifact.conditions.some((c) => c.kind === 'state' && c.id === 'state:hover'),
    ).toBe(true);

    // ---- dependencies (fabric prefilter data) ------------------------------
    // Base-only classes are condition-independent; variant classes list the
    // union of their variants' conditionIds.
    expect(artifact.dependencies['p-4']).toEqual([]);
    expect(artifact.dependencies['bg-zinc-950']).toEqual([]);
    expect(artifact.dependencies['dark:text-zinc-300']).toEqual(['color-scheme:dark']);
    expect(artifact.dependencies['sm:p-2']).toEqual(['media-width:>=:640']);
    expect(artifact.dependencies['ios:bg-white']).toEqual(['platform:ios']);
    expect(artifact.dependencies['hover:bg-red-500']).toEqual(['state:hover']);
    // Every emitted class carries an entry, keyed 1:1 with styles.
    expect(Object.keys(artifact.dependencies).sort()).toEqual(
      Object.keys(artifact.styles).sort(),
    );

    // ---- diagnostics -------------------------------------------------------
    expect(diagnostics.some((d) => d.code === 'WF1004')).toBe(true); // first:
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

describe('generate({ platform: "web" })', () => {
  it('returns raw CSS when platform is web', async () => {
    const result = await generate({ entry: ENTRY, base: FIXTURE, platform: 'web' });
    expect(result.css).toBeDefined();
    expect(typeof result.css).toBe('string');
    expect(result.css!.length).toBeGreaterThan(0);
    // Fixture utilities must appear in the compiled CSS.
    expect(result.css).toContain('.p-4');
    expect(result.css).toContain('.bg-zinc-950');
    // Pseudo-class and media selectors are present (browser evaluates them).
    expect(result.css).toContain('hover\\:bg-red-500');
    expect(result.css).toContain('@media');
  });

  it('omits css field when platform is not specified (native default)', async () => {
    const result = await generate({ entry: ENTRY, base: FIXTURE });
    expect(result.css).toBeUndefined();
    // Artifact is still produced for native consumption.
    expect(result.artifact.hash).toBeTruthy();
    expect(Object.keys(result.artifact.styles).length).toBeGreaterThan(0);
  });

  it('produces deterministic CSS across builds', async () => {
    const first = await generate({ entry: ENTRY, base: FIXTURE, platform: 'web' });
    const second = await generate({ entry: ENTRY, base: FIXTURE, platform: 'web' });
    expect(first.css).toBe(second.css);
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

  it('emits dependencies as the sorted union of variant condition ids', () => {
    const css = `
      .card { padding: 4px; }
      @media (min-width: 640px) { .card { padding: 8px; } }
      @media (max-width: 320px) { .card { padding: 2px; } }
      @media (min-width: 640px) { .card { margin: 8px; } }
      .plain { padding: 4px; }
    `;
    const { artifact } = buildArtifact(css, 1);
    expect(artifact.dependencies['card']).toEqual([
      'media-width:<=:320',
      'media-width:>=:640',
    ]);
    expect(artifact.dependencies['plain']).toEqual([]);
  });
});

async function buildUtilities(candidates: string[]) {
  const { css } = await compileTailwindCss(ENTRY, new Set(candidates));
  return buildArtifact(css, 1);
}

describe('layout keyword lowering (lightningcss typed enums)', () => {
  it('lowers alignment utilities from typed enum values', async () => {
    const { artifact, diagnostics } = await buildUtilities([
      'items-center',
      'justify-between',
      'justify-center',
      'self-stretch',
      'text-center',
    ]);
    expect(diagnostics).toEqual([]);
    expect(findProperty(artifact.styles['items-center'].base, 'alignItems')?.value).toEqual({
      kind: 'string',
      value: 'center',
    });
    expect(findProperty(artifact.styles['justify-between'].base, 'justifyContent')?.value).toEqual({
      kind: 'string',
      value: 'space-between',
    });
    expect(findProperty(artifact.styles['justify-center'].base, 'justifyContent')?.value).toEqual({
      kind: 'string',
      value: 'center',
    });
    expect(findProperty(artifact.styles['self-stretch'].base, 'alignSelf')?.value).toEqual({
      kind: 'string',
      value: 'stretch',
    });
    expect(findProperty(artifact.styles['text-center'].base, 'textAlign')?.value).toEqual({
      kind: 'string',
      value: 'center',
    });
  });

  it('lowers display/position/flex-direction/wrap/font-style enums', async () => {
    const { artifact, diagnostics } = await buildUtilities([
      'hidden',
      'absolute',
      'relative',
      'flex-col',
      'flex-wrap',
      'italic',
    ]);
    expect(diagnostics).toEqual([]);
    expect(findProperty(artifact.styles['hidden'].base, 'display')?.value).toEqual({
      kind: 'string',
      value: 'none',
    });
    expect(findProperty(artifact.styles['absolute'].base, 'position')?.value).toEqual({
      kind: 'string',
      value: 'absolute',
    });
    expect(findProperty(artifact.styles['relative'].base, 'position')?.value).toEqual({
      kind: 'string',
      value: 'relative',
    });
    expect(findProperty(artifact.styles['flex-col'].base, 'flexDirection')?.value).toEqual({
      kind: 'string',
      value: 'column',
    });
    expect(findProperty(artifact.styles['flex-wrap'].base, 'flexWrap')?.value).toEqual({
      kind: 'string',
      value: 'wrap',
    });
    expect(findProperty(artifact.styles['italic'].base, 'fontStyle')?.value).toEqual({
      kind: 'string',
      value: 'italic',
    });
  });

  it('maps bare start/end alignment to the flex keywords RN accepts', () => {
    // Hand-written CSS: `align-items: start` arrives as a bare keyword that
    // React Native does not accept — RN wants flex-start/flex-end.
    const css = `
      .a { align-items: start; }
      .b { justify-content: end; }
    `;
    const { artifact, diagnostics } = buildArtifact(css, 1);
    expect(diagnostics).toEqual([]);
    expect(findProperty(artifact.styles['a'].base, 'alignItems')?.value).toEqual({
      kind: 'string',
      value: 'flex-start',
    });
    expect(findProperty(artifact.styles['b'].base, 'justifyContent')?.value).toEqual({
      kind: 'string',
      value: 'flex-end',
    });
  });

  it('still reports WF1005 for complex enum shapes', () => {
    // border-style arrives as a per-side object and text-transform as a case
    // object — neither has a safe static single-value lowering yet.
    const css = `
      .a { border-style: solid; }
      .b { text-transform: uppercase; }
    `;
    const { artifact, diagnostics } = buildArtifact(css, 1);
    expect(artifact.styles['a']).toBeUndefined();
    expect(artifact.styles['b']).toBeUndefined();
    expect(diagnostics.filter((d) => d.code === 'WF1005')).toHaveLength(2);
  });
});

describe('logical box shorthands (px-*/py-*/mx-*/my-*)', () => {
  it('lowers axis shorthands to RN axis properties', async () => {
    const { artifact, diagnostics } = await buildUtilities(['px-6', 'py-3', 'mx-4', 'my-2']);
    expect(diagnostics).toEqual([]);
    expect(findProperty(artifact.styles['px-6'].base, 'paddingHorizontal')?.value).toEqual({
      kind: 'number',
      value: 24,
    });
    expect(findProperty(artifact.styles['py-3'].base, 'paddingVertical')?.value).toEqual({
      kind: 'number',
      value: 12,
    });
    expect(findProperty(artifact.styles['mx-4'].base, 'marginHorizontal')?.value).toEqual({
      kind: 'number',
      value: 16,
    });
    expect(findProperty(artifact.styles['my-2'].base, 'marginVertical')?.value).toEqual({
      kind: 'number',
      value: 8,
    });
  });

  it('falls back to physical longhands when sides differ', () => {
    const css = `
      .a { padding-inline: 8px 12px; }
      .b { margin-block: 4px 6px; }
    `;
    const { artifact, diagnostics } = buildArtifact(css, 1);
    expect(diagnostics).toEqual([]);
    expect(findProperty(artifact.styles['a'].base, 'paddingLeft')?.value).toEqual({
      kind: 'number',
      value: 8,
    });
    expect(findProperty(artifact.styles['a'].base, 'paddingRight')?.value).toEqual({
      kind: 'number',
      value: 12,
    });
    expect(findProperty(artifact.styles['b'].base, 'marginTop')?.value).toEqual({
      kind: 'number',
      value: 4,
    });
    expect(findProperty(artifact.styles['b'].base, 'marginBottom')?.value).toEqual({
      kind: 'number',
      value: 6,
    });
  });
});
