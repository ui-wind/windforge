/**
 * Metro end-to-end compile benchmarks (Phase 9).
 *
 * `compileWindforge` is the full build-time path Metro runs at startup:
 * scan → compile → lower → render generated module. Benchmarked with and
 * without the extension trio (utility + tokens + variant) used by the
 * example app. The artifact write target is a fixed tmp dir reused across
 * iterations — the benchmark target is compilation, not filesystem churn.
 *
 * Run with `pnpm --filter @windforge/metro bench`.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineTokens, defineUtility, defineVariant } from '@windforge/extension-sdk';
import { afterAll, bench, describe } from 'vitest';
import { compileWindforge } from '../src/index.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/app');
const ENTRY = resolve(FIXTURE, 'src/global.css');

const outputDir = await mkdtemp(resolve(tmpdir(), 'windforge-metro-bench-'));
afterAll(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

const EXTENSIONS = [
  defineUtility({ name: 'glass', css: 'opacity: 0.8;' }),
  defineTokens({ colors: { brand: '#22c55e' } }),
  defineVariant({ name: 'land', media: '(orientation: landscape)' }),
];

describe('compileWindforge end-to-end', () => {
  bench(
    'fixture app — no extensions',
    async () => {
      await compileWindforge({
        entry: ENTRY,
        base: FIXTURE,
        outputDir,
        diagnostics: false,
      });
    },
    { time: 2000 },
  );

  bench(
    'fixture app — extension trio',
    async () => {
      await compileWindforge({
        entry: ENTRY,
        base: FIXTURE,
        outputDir,
        diagnostics: false,
        extensions: EXTENSIONS,
      });
    },
    { time: 2000 },
  );
});
