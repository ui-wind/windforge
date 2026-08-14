/**
 * Cross-process determinism probe (Phase 9).
 *
 * Imports the BUILT metro package (dist) so a fresh process compiles the
 * fixture end-to-end — extension rendering and generated-module bytes
 * included. Prints `<hash>\n<generated module>` to stdout; the test harness
 * runs this in separate processes and compares the output byte-for-byte.
 *
 * Run via `node tests/helpers/print-compiled.mjs` from the package root.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineTokens, defineUtility, defineVariant } from '@windforge/extension-sdk';
import { compileWindforge } from '../../dist/index.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures/app');
const ENTRY = resolve(FIXTURE, 'src/global.css');

const outputDir = await mkdtemp(resolve(tmpdir(), 'windforge-determinism-'));
try {
  // Same extension trio as compiler.test.ts — extensions must not break
  // byte-determinism of the generated module.
  const { hash, outputFile, diagnostics } = await compileWindforge({
    entry: ENTRY,
    base: FIXTURE,
    outputDir,
    diagnostics: false,
    watch: false,
    extensions: [
      defineUtility({ name: 'glass', css: 'opacity: 0.8;' }),
      defineTokens({ colors: { brand: '#22c55e' } }),
      defineVariant({ name: 'land', media: '(orientation: landscape)' }),
    ],
  });
  if (diagnostics.length > 0) {
    console.error('unexpected diagnostics:', diagnostics);
    process.exit(2);
  }
  const content = await readFile(outputFile, 'utf8');
  process.stdout.write(`${hash}\n${content}`);
} finally {
  await rm(outputDir, { recursive: true, force: true });
}
