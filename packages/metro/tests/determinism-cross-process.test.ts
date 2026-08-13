/**
 * Cross-process determinism (Phase 9).
 *
 * The strongest workspace-level evidence: three separate `node` processes
 * compile the fixture (extensions included) through the BUILT metro package
 * and must produce byte-identical generated modules. In-process determinism
 * is already covered by tailwind's pipeline test and the CLI compile test;
 * this closes the gap between "same call twice" and "fresh process, fresh
 * module graph, fresh tmp output dir".
 *
 * Requires the package's own dist: the turbo override in package.json adds
 * `build` to this package's test dependencies.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const HELPER = resolve(dirname(fileURLToPath(import.meta.url)), 'helpers/print-compiled.mjs');

async function runCompilation(): Promise<string> {
  const { stdout, stderr } = await execFileAsync(process.execPath, [HELPER], {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  });
  if (stderr) throw new Error(`print-compiled.mjs stderr: ${stderr}`);
  return stdout;
}

describe('cross-process determinism', () => {
  it(
    'produces byte-identical output across fresh processes',
    { timeout: 180_000 },
    async () => {
      const runs = await Promise.all([runCompilation(), runCompilation(), runCompilation()]);

      for (const stdout of runs) {
        expect(stdout).not.toBe('');
        const hash = stdout.split('\n', 1)[0];
        expect(hash).toMatch(/^[0-9a-f]{8}$/);
      }
      // Byte-identity of hash + full generated module (registerArtifact
      // calls, extension-rendered classes, custom frontend artifacts).
      expect(runs[1]).toBe(runs[0]);
      expect(runs[2]).toBe(runs[0]);
    },
  );
});
