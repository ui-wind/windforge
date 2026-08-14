/**
 * compileWindforge — extension injection and the custom frontend interface.
 */
import { defineTokens, defineUtility, defineVariant } from '@windforge/extension-sdk';
import type { RuntimeArtifact } from '@windforge/tailwind';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { compileWindforge } from '../src/index.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/app');
const ENTRY = resolve(FIXTURE, 'src/global.css');

const tempDirs: string[] = [];
async function tempOutputDir(): Promise<string> {
  const dir = await mkdtemp(resolve(tmpdir(), 'windforge-metro-'));
  tempDirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

function customArtifact(overrides: Partial<RuntimeArtifact> = {}): RuntimeArtifact {
  return {
    version: 1,
    irVersion: 1,
    hash: 'frontend01',
    styles: {
      'p-custom': {
        base: [{ property: 'padding', value: { kind: 'number', value: 12 }, priority: 10, sourceOrder: 0 }],
      },
    },
    conditions: [],
    dependencies: { 'p-custom': [] },
    ...overrides,
  };
}

describe('compileWindforge', () => {
  it('writes a single-artifact module without extensions', async () => {
    const outputDir = await tempOutputDir();
    const { outputFile, hash, hashes } = await compileWindforge({
      entry: ENTRY,
      base: FIXTURE,
      outputDir,
      diagnostics: false,
      watch: false,
    });
    const content = await readFile(outputFile, 'utf8');
    expect(outputFile).toContain('generated.js');
    expect(content).toContain('import { registerArtifact }');
    expect(content.match(/registerArtifact\(/g)).toHaveLength(1);
    expect(content).toContain('"p-4"');
    expect(hashes).toEqual([hash]);
  });

  it('injects extension descriptors as CSS (utility, tokens, variant)', async () => {
    const outputDir = await tempOutputDir();
    const baseline = await compileWindforge({
      entry: ENTRY,
      base: FIXTURE,
      outputDir,
      diagnostics: false,
      watch: false,
    });
    const { hash, hashes, diagnostics } = await compileWindforge({
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
    expect(diagnostics).toEqual([]);
    expect(hash).not.toBe(baseline.hash);
    expect(hashes).toEqual([hash]);

    const content = await readFile(baseline.outputFile, 'utf8');
    expect(content).toContain('"glass"');
    expect(content).toContain('"bg-brand"');
    expect(content).toContain('"land:bg-emerald-500"');
    expect(content).toContain('orientation:landscape');
  });

  it('reports WF3xxx diagnostics and keeps valid extensions', async () => {
    const outputDir = await tempOutputDir();
    const { diagnostics } = await compileWindforge({
      entry: ENTRY,
      base: FIXTURE,
      outputDir,
      diagnostics: false,
      watch: false,
      extensions: [
        defineUtility({ name: 'glass', css: 'opacity: 0.8;' }),
        defineUtility({ name: 'Bad-Name', css: 'opacity: 1;' }),
      ],
    });
    expect(diagnostics.map((d) => d.code)).toEqual(['WF3001']);
    const content = await readFile(resolve(outputDir, 'generated.js'), 'utf8');
    expect(content).toContain('"glass"');
  });

  it('registers custom frontend artifacts after the Tailwind one', async () => {
    const outputDir = await tempOutputDir();
    const { hash, hashes } = await compileWindforge({
      entry: ENTRY,
      base: FIXTURE,
      outputDir,
      diagnostics: false,
      watch: false,
      frontends: [
        {
          name: 'demo-frontend',
          generate: () => [customArtifact()],
        },
      ],
    });
    expect(hashes).toEqual([hash, 'frontend01']);

    const content = await readFile(resolve(outputDir, 'generated.js'), 'utf8');
    expect(content.match(/registerArtifact\(/g)).toHaveLength(2);
    // Registration order = override order: Tailwind first, frontend last.
    expect(content.indexOf('"p-4"')).toBeLessThan(content.indexOf('"p-custom"'));
    expect(content).toContain('"dependencies"');
  });

  it('WF3010 rejects frontend artifacts with mismatched versions', async () => {
    const outputDir = await tempOutputDir();
    const { hashes, diagnostics } = await compileWindforge({
      entry: ENTRY,
      base: FIXTURE,
      outputDir,
      diagnostics: false,
      watch: false,
      frontends: [
        {
          name: 'demo-frontend',
          generate: () => [customArtifact({ version: 99 })],
        },
      ],
    });
    expect(hashes).toHaveLength(1);
    expect(diagnostics.map((d) => d.code)).toEqual(['WF3010']);
    const content = await readFile(resolve(outputDir, 'generated.js'), 'utf8');
    expect(content).not.toContain('frontend01');
  });

  it('WF3010 rejects frontend artifacts without a dependencies map', async () => {
    const outputDir = await tempOutputDir();
    const noDeps = customArtifact();
    delete (noDeps as { dependencies?: unknown }).dependencies;
    const { diagnostics } = await compileWindforge({
      entry: ENTRY,
      base: FIXTURE,
      outputDir,
      diagnostics: false,
      watch: false,
      frontends: [{ name: 'demo-frontend', generate: () => [noDeps] }],
    });
    expect(diagnostics.map((d) => d.code)).toEqual(['WF3010']);
    expect(diagnostics[0]?.message).toContain('dependencies');
  });
});
