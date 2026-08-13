/**
 * Compiler stress tests (Phase 9).
 *
 * Two layers of evidence:
 *
 * 1. Full-utility-surface sweep — every implemented utility category is
 *    compiled through the real pipeline and asserted present in the
 *    artifact, with zero resolution diagnostics. The artifact hash / class
 *    count / condition count are snapshotted so a compiler or Tailwind
 *    upgrade that changes output is a visible, intentional event
 *    (`vitest -u` only when the change is intended).
 * 2. Large-N stress — thousands of programmatically generated candidates
 *    (palette × shade, spacing scale, arbitrary values, variant prefixes)
 *    must compile, lower, and stay byte-deterministic.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildArtifact, type RuntimeArtifact } from '../src/artifact.js';
import { compileTailwindCss } from '../src/compile.js';
import type { Diagnostic } from '../src/types.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/app');
const ENTRY = resolve(FIXTURE, 'src/global.css');

// The app fixture defines the `ios:` platform variant; the sweep exercises
// the remaining platform/direction variants through the same extraCss seam
// @windforge/metro uses for extensions.
const EXTRA_VARIANTS = `
@custom-variant android (@media (platform: android));
@custom-variant web (@media (platform: web));
@custom-variant rtl (@media (layout-direction: rtl));
@custom-variant ltr (@media (layout-direction: ltr));
`;

type BuildOutput = { artifact: RuntimeArtifact; diagnostics: Diagnostic[] };

async function buildUtilities(candidates: string[]): Promise<BuildOutput> {
  const { css, diagnostics } = await compileTailwindCss(ENTRY, candidates, {
    extraCss: EXTRA_VARIANTS,
  });
  const built = buildArtifact(css, 1);
  return {
    artifact: built.artifact,
    diagnostics: [...diagnostics, ...built.diagnostics],
  };
}

// ---- supported surface ----------------------------------------------------

const SPACING = [
  'p-0', 'p-1', 'p-2', 'p-4', 'p-8',
  'px-3', 'py-5', 'pt-1', 'pb-2',
  'm-1', 'm-4', 'mx-2', 'my-3',
  'gap-4', 'gap-x-2', 'gap-y-3',
];

const SIZING = ['w-4', 'h-1/2', 'w-full', 'size-8', 'min-w-0', 'max-w-sm'];

const FLEX = [
  'flex-1', 'flex-row', 'flex-col', 'flex-wrap',
  'grow', 'shrink-0',
  'items-center', 'items-start', 'justify-between', 'justify-center',
  'self-stretch',
];

const POSITION = ['absolute', 'relative', 'top-1', 'left-2', 'z-10'];

const COLORS = [
  'bg-red-500', 'bg-zinc-950', 'bg-white/50',
  'text-emerald-500', 'border-indigo-500',
  'bg-accent', // @theme token from the fixture entry
  'bg-[#ff0000]',
];

const TYPOGRAPHY = [
  'text-xs', 'text-sm', 'text-lg', 'text-3xl',
  'font-bold', 'font-medium', 'text-center', 'italic',
];

const BORDERS = [
  'border', 'border-2', 'border-t',
  'rounded', 'rounded-lg', 'rounded-full',
];

const OPACITY = ['opacity-50', 'opacity-0'];

const TRANSFORMS = ['rotate-45', '-rotate-6', 'scale-105', 'translate-x-2'];

const MOTION = [
  'transition', 'duration-500', 'delay-150', 'ease-in-out',
  'animate-spin', 'animate-pulse',
];

const ARBITRARY = ['w-[13px]', 'p-[11px]', 'text-[14px]', 'rounded-[7px]', 'h-[4.5rem]'];

const VARIANT_STACKS = [
  'dark:bg-red-500', 'sm:p-2', 'ios:bg-white', 'android:bg-black',
  'web:opacity-50', 'rtl:border-indigo-500', 'ltr:bg-white',
  'dark:sm:bg-emerald-500', 'sm:dark:text-white',
];

const SUPPORTED = [
  ...SPACING, ...SIZING, ...FLEX, ...POSITION, ...COLORS, ...TYPOGRAPHY,
  ...BORDERS, ...OPACITY, ...TRANSFORMS, ...MOTION, ...ARBITRARY,
  ...VARIANT_STACKS,
];

// Control set: expected to be skipped with exactly the documented diagnostic.
const CONTROLS = ['hover:bg-red-500'];

describe('full-utility-surface sweep', () => {
  let output: BuildOutput;

  beforeAll(async () => {
    output = await buildUtilities([...SUPPORTED, ...CONTROLS]);
  });

  it('resolves every supported candidate into the artifact', () => {
    const misses = SUPPORTED.filter((c) => !(c in output.artifact.styles));
    expect(misses, `candidates missing from the artifact: ${misses.join(', ')}`).toEqual([]);
  });

  it('emits no resolution diagnostics on the supported surface', () => {
    const unexpected = output.diagnostics.filter((d) =>
      ['WF1001', 'WF1002', 'WF1003', 'WF1005'].includes(d.code),
    );
    expect(unexpected).toEqual([]);
  });

  it('reports exactly one deduplicated WF1004 for the pseudo-state control', () => {
    const wf1004 = output.diagnostics.filter((d) => d.code === 'WF1004');
    expect(wf1004).toHaveLength(1);
    expect(output.artifact.styles['hover:bg-red-500']).toBeUndefined();
  });

  it('keeps dependencies keyed 1:1 with styles', () => {
    expect(Object.keys(output.artifact.dependencies).sort()).toEqual(
      Object.keys(output.artifact.styles).sort(),
    );
  });

  it('is deterministic across two builds', async () => {
    const again = await buildUtilities([...SUPPORTED, ...CONTROLS]);
    expect(JSON.stringify(again.artifact)).toBe(JSON.stringify(output.artifact));
    expect(again.artifact.hash).toBe(output.artifact.hash);
  });

  it('snapshots the artifact shape (update only on intended compiler changes)', () => {
    expect({
      hash: output.artifact.hash,
      classes: Object.keys(output.artifact.styles).length,
      conditions: output.artifact.conditions.length,
    }).toMatchSnapshot();
  });
});

// ---- large-N stress ---------------------------------------------------------

// Tailwind's integer spacing scale (0–96 as shipped by the default theme).
const SPACING_SCALE = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
];
const HUES = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green',
  'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo',
];
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

function generateCandidates(): string[] {
  const candidates: string[] = [];
  for (const hue of HUES) {
    for (const shade of SHADES) {
      candidates.push(`bg-${hue}-${shade}`, `text-${hue}-${shade}`, `border-${hue}-${shade}`);
    }
  }
  for (const n of SPACING_SCALE) {
    candidates.push(`p-${n}`, `m-${n}`, `gap-${n}`, `w-${n}`, `h-${n}`);
    candidates.push(`mt-${n}`, `mb-${n}`, `ml-${n}`, `mr-${n}`);
    candidates.push(`pt-${n}`, `pb-${n}`, `pl-${n}`, `pr-${n}`);
  }
  // Arbitrary values exercise the parser/lowering path at volume.
  for (let n = 1; n <= 1200; n++) candidates.push(`w-[${n}px]`, `p-[${n}px]`);
  for (let n = 1; n <= 600; n++) candidates.push(`text-[${n}px]`, `m-[${n}px]`);
  // Variant prefixes over large subsets.
  for (const hue of HUES) {
    for (const shade of SHADES) candidates.push(`dark:bg-${hue}-${shade}`);
  }
  for (const n of SPACING_SCALE) candidates.push(`sm:p-${n}`);
  for (let n = 1; n <= 100; n++) candidates.push(`ios:w-[${n}px]`, `dark:text-[${n}px]`);
  return candidates;
}

describe('large-N candidate stress', () => {
  it(
    'compiles thousands of candidates deterministically',
    { timeout: 120_000 },
    async () => {
      const candidates = generateCandidates();
      expect(candidates.length).toBeGreaterThan(4000);

      const started = performance.now();
      const first = await buildUtilities(candidates);
      const second = await buildUtilities(candidates);
      const elapsedMs = Math.round(performance.now() - started);
      console.info(
        `[stress] ${candidates.length} candidates → ${Object.keys(first.artifact.styles).length} classes, 2 builds in ${elapsedMs}ms`,
      );

      // Informational only (AGENTS.md: no performance claims from tests);
      // the guard is deliberately loose — a regression alarm, not a target.
      expect(elapsedMs).toBeLessThan(120_000);

      const misses = candidates.filter((c) => !(c in first.artifact.styles));
      expect(misses, `missing ${misses.length} classes, e.g. ${misses.slice(0, 10).join(', ')}`).toEqual([]);
      expect(second.artifact.hash).toBe(first.artifact.hash);
      expect(JSON.stringify(second.artifact)).toBe(JSON.stringify(first.artifact));
    },
  );
});
