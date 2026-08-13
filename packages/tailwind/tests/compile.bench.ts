/**
 * Tailwind compile pipeline benchmarks (Phase 9).
 *
 * Four build-time stages, each isolated:
 * - cold compile: full `compileTailwindCss` (compile + build) per iteration;
 * - incremental compile: one oxide `compile()` at setup, then `build()` on
 *   candidate slices per iteration (the Metro rebuild shape);
 * - candidate extraction: content-based `scanFiles` over generated sources;
 * - candidate→IR lowering: `buildArtifact` over a large stylesheet compiled
 *   once at setup.
 *
 * These are local reference measurements (AGENTS.md: no performance claims
 * without recorded runs) — pair with `scripts/bench-env.mjs` when recording.
 * Run with `pnpm --filter @windforge/tailwind bench`.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@tailwindcss/node';
import { bench, describe } from 'vitest';
import { buildArtifact } from '../src/artifact.js';
import { compileTailwindCss } from '../src/compile.js';
import { scanFiles } from '../src/index.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/app');
const ENTRY = resolve(FIXTURE, 'src/global.css');

const EXTRA_VARIANTS = `
@custom-variant android (@media (platform: android));
@custom-variant web (@media (platform: web));
@custom-variant rtl (@media (layout-direction: rtl));
@custom-variant ltr (@media (layout-direction: ltr));
`;

const HUES = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green',
  'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo',
];
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const SPACING_SCALE = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
];

function largeCandidateSet(): string[] {
  const candidates: string[] = [];
  for (const hue of HUES) {
    for (const shade of SHADES) {
      candidates.push(`bg-${hue}-${shade}`, `text-${hue}-${shade}`, `border-${hue}-${shade}`);
    }
  }
  for (const n of SPACING_SCALE) {
    candidates.push(`p-${n}`, `m-${n}`, `gap-${n}`, `w-${n}`, `h-${n}`);
  }
  for (let n = 1; n <= 300; n++) candidates.push(`w-[${n}px]`, `p-[${n}px]`);
  return candidates;
}

const SMALL_CANDIDATES = [
  'p-4', 'm-2', 'gap-3', 'w-full', 'h-1/2', 'flex-1', 'flex-row',
  'items-center', 'justify-between', 'bg-zinc-950', 'text-white',
  'text-sm', 'font-bold', 'border', 'border-2', 'rounded', 'rounded-lg',
  'rounded-full', 'opacity-50', 'rotate-45', 'transition', 'animate-spin',
  'dark:bg-white', 'sm:p-2', 'ios:bg-white', 'rtl:border-indigo-500',
  'w-[13px]', 'p-[11px]',
];

const LARGE_CANDIDATES = largeCandidateSet();

// Module-scope setup (top-level await): one shared oxide compiler for the
// incremental benches and one large stylesheet for the lowering bench.
const ENTRY_SOURCE = await readFile(ENTRY, 'utf8');
const INCREMENTAL_COMPILER = await compile(`${ENTRY_SOURCE}\n${EXTRA_VARIANTS}`, {
  base: dirname(ENTRY),
  from: ENTRY,
  onDependency: () => {},
});
const LARGE_STYLESHEET = (
  await compileTailwindCss(ENTRY, LARGE_CANDIDATES, { extraCss: EXTRA_VARIANTS })
).css;

describe('cold compile (full pipeline per iteration)', () => {
  bench(
    'compileTailwindCss — sweep surface',
    async () => {
      await compileTailwindCss(ENTRY, SMALL_CANDIDATES, { extraCss: EXTRA_VARIANTS });
    },
    { time: 2000 },
  );
});

describe('incremental compile (oxide compiler reused)', () => {
  // Rotate one arbitrary candidate per call so oxide's memo cache misses —
  // identical input arrays return cached builds and would measure the cache,
  // not the rebuild work Metro does when sources change.
  let tick = 0;
  const rotatingSmall = () => [
    ...SMALL_CANDIDATES.filter((c) => !c.startsWith('w-[')),
    `w-[${(tick++ % 300) + 1}px]`,
  ];
  const rotatingLarge = () => [...LARGE_CANDIDATES, `p-[${(tick++ % 300) + 301}px]`];

  bench(
    'compiler.build — sweep surface',
    () => {
      INCREMENTAL_COMPILER.build(rotatingSmall());
    },
    { time: 2000 },
  );

  bench(
    'compiler.build — large candidate set',
    () => {
      INCREMENTAL_COMPILER.build(rotatingLarge());
    },
    { time: 2000 },
  );
});

describe('candidate extraction (scanFiles, content-based)', () => {
  const FILES = Array.from({ length: 64 }, (_, i) => ({
    file: `src/screen-${i}.tsx`,
    content: Array.from(
      { length: 24 },
      (_, j) => `<View className="p-${(i + j) % 8} m-${(i * j) % 12} bg-zinc-${(j % 10) * 100} text-sm" />`,
    ).join('\n'),
  }));

  bench(
    'scanFiles — 64 files × 24 lines',
    () => {
      scanFiles(FILES);
    },
    { time: 2000 },
  );
});

describe('candidate→IR lowering', () => {
  bench(
    'buildArtifact — large stylesheet',
    () => {
      buildArtifact(LARGE_STYLESHEET, 1);
    },
    { time: 2000 },
  );
});
