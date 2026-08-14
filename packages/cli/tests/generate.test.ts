import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { generateCommand } from '../src/index.js';

const TAILWIND_PKG_DIR = fileURLToPath(new URL('../../tailwind', import.meta.url));
const ENTRY = join(TAILWIND_PKG_DIR, 'tests/fixtures/app/src/global.css');

const scratch = mkdtempSync(join(tmpdir(), 'windforge-cli-generate-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('generateCommand', () => {
  it('generates a JS module from a CSS entry', async () => {
    const result = await generateCommand({ entry: ENTRY, output: scratch });
    expect(result.jsPath).toContain('generated.js');
    const js = readFileSync(result.jsPath, 'utf8');
    expect(js).toContain('registerArtifact');
  });

  it('dumps artifact JSON when --dump-ir is set', async () => {
    const outDir = join(scratch, 'ir-dump');
    const result = await generateCommand({
      entry: ENTRY,
      output: outDir,
      dumpIr: true,
    });
    expect(result.irPath).toBeDefined();
    const ir = JSON.parse(readFileSync(result.irPath!, 'utf8'));
    expect(ir.styles).toBeDefined();
    expect(typeof ir.version).toBe('number');
  });

  it('does not write artifact.json without --dump-ir', async () => {
    const outDir = join(scratch, 'no-dump');
    const result = await generateCommand({ entry: ENTRY, output: outDir });
    expect(result.irPath).toBeUndefined();
  });

  it('targets web platform when specified', async () => {
    const outDir = join(scratch, 'web-platform');
    const result = await generateCommand({
      entry: ENTRY,
      output: outDir,
      platform: 'web',
      dumpIr: true,
    });
    // Web platform generates CSS; the artifact still has styles for registry.
    const ir = JSON.parse(readFileSync(result.irPath!, 'utf8'));
    expect(ir.styles).toBeDefined();
  });
});
