import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileWindforge } from '../src/compiler.js';
import { windforgeResolveRequest } from '../src/resolver.js';
import type { ResolverContextLike } from '../src/resolver.js';

const FIXTURE_ENTRY = resolve(__dirname, 'fixtures/app/src/global.css');

let tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'windforge-metro-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('compileWindforge', () => {
  it('writes generated.js registering the artifact', async () => {
    const outputDir = await makeTempDir();
    const result = await compileWindforge({
      entry: FIXTURE_ENTRY,
      base: resolve(__dirname, 'fixtures/app'),
      outputDir,
      diagnostics: false,
    });

    expect(existsSync(result.outputFile)).toBe(true);
    expect(result.outputFile.endsWith('generated.js')).toBe(true);
    expect(result.hash).toMatch(/^[0-9a-f]{8}$/);

    const contents = readFileSync(result.outputFile, 'utf8');
    expect(contents).toContain('registerArtifact');
    expect(contents).toContain('"p-4"');
    expect(contents).toContain('"backgroundColor"');
  });

  it('is deterministic across runs', async () => {
    const outputDir = await makeTempDir();
    const first = await compileWindforge({
      entry: FIXTURE_ENTRY,
      base: resolve(__dirname, 'fixtures/app'),
      outputDir,
      diagnostics: false,
    });
    const second = await compileWindforge({
      entry: FIXTURE_ENTRY,
      base: resolve(__dirname, 'fixtures/app'),
      outputDir,
      diagnostics: false,
    });
    expect(first.hash).toBe(second.hash);
    expect(readFileSync(first.outputFile, 'utf8')).toBe(
      readFileSync(second.outputFile, 'utf8'),
    );
  });
});

describe('windforgeResolveRequest', () => {
  function makeContext(
    fallback: (name: string) => string,
  ): ResolverContextLike {
    const context = {
      resolveRequest: (ctx: ResolverContextLike, moduleName: string) =>
        ({ type: 'sourceFile', filePath: fallback(moduleName) }) as {
          type: string;
          filePath: string;
        },
    };
    return context;
  }

  it('intercepts windforge/generated', () => {
    const resolveRequest = windforgeResolveRequest('/out/generated.js');
    const context = makeContext(() => '/fallback.js');
    const resolution = resolveRequest(context, 'windforge/generated', null);
    expect(resolution).toEqual({ type: 'sourceFile', filePath: '/out/generated.js' });
  });

  it('delegates everything else to Metro resolution', () => {
    const resolveRequest = windforgeResolveRequest('/out/generated.js');
    const context = makeContext((name) => `/resolved/${name}.js`);
    expect(resolveRequest(context, 'react', null)).toEqual({
      type: 'sourceFile',
      filePath: '/resolved/react.js',
    });
  });

  it('chains an existing resolveRequest', () => {
    const existing = (
      _ctx: ResolverContextLike,
      moduleName: string,
    ): { type: string; filePath: string } => ({
      type: 'sourceFile',
      filePath: `/existing/${moduleName}.js`,
    });
    const resolveRequest = windforgeResolveRequest('/out/generated.js', existing);
    const context = makeContext(() => '/should-not-reach.js');
    expect(resolveRequest(context, 'expo-router', null)).toEqual({
      type: 'sourceFile',
      filePath: '/existing/expo-router.js',
    });
    expect(resolveRequest(context, 'windforge/generated', null)).toEqual({
      type: 'sourceFile',
      filePath: '/out/generated.js',
    });
  });
});
