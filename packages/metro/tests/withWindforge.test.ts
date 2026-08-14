import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { withWindforge } from '../src/index.js';
import type { ResolverContextLike } from '../src/resolver.js';

const tempDirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(resolve(tmpdir(), 'wf-resolver-'));
  tempDirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('withWindforge', () => {
  it('returns a config with windforge options attached', () => {
    const base = { resolver: { sourceExts: ['ts', 'tsx'] } };
    const config = withWindforge(base, { input: './global.css' });

    expect(config.windforge.input).toBe('./global.css');
    expect(config.resolver?.sourceExts).toEqual(['ts', 'tsx']);
  });

  it('installs a resolveRequest that maps windforge/generated', () => {
    const config = withWindforge({});
    const resolveRequest = config.resolver?.resolveRequest as (
      context: ResolverContextLike,
      moduleName: string,
      platform: string | null | undefined,
    ) => { type: string; filePath: string };
    expect(typeof resolveRequest).toBe('function');

    const context = {
      resolveRequest: () => ({ type: 'sourceFile', filePath: '/never.js' }),
    } as unknown as ResolverContextLike;
    const resolution = resolveRequest(context, 'windforge/generated', null);
    expect(resolution.type).toBe('sourceFile');
    expect(resolution.filePath).toContain('.windforge');
    expect(resolution.filePath).toContain('generated.js');
  });

  it('applies defaults for outputDir and diagnostics', () => {
    const config = withWindforge({});
    expect(config.windforge.outputDir).toBe('.windforge');
    expect(config.windforge.diagnostics).toBe(true);
  });

  it('lets explicit options override defaults', () => {
    const config = withWindforge({}, { outputDir: 'build/wf', diagnostics: false });
    expect(config.windforge.outputDir).toBe('build/wf');
    expect(config.windforge.diagnostics).toBe(false);
  });

  it('does not mutate the incoming config', () => {
    const base = { projectRoot: '/app' };
    const config = withWindforge(base);
    expect(config).not.toBe(base);
    expect('windforge' in base).toBe(false);
  });

  it('throws clearly on a non-object config', () => {
    expect(() => withWindforge(null as never)).toThrowError(/Metro config/);
  });

  describe('web platform split', () => {
    it('serves the web module when platform is web and .web.js exists', async () => {
      const outputDir = await tempDir();
      // Create both native and web artifact files.
      await writeFile(join(outputDir, 'generated.js'), '// native');
      await writeFile(join(outputDir, 'generated.web.js'), '// web');

      const config = withWindforge({}, { outputDir });
      const resolveRequest = config.resolver?.resolveRequest as (
        context: ResolverContextLike,
        moduleName: string,
        platform: string | null | undefined,
      ) => { type: string; filePath: string };

      const context = {
        resolveRequest: () => ({ type: 'sourceFile', filePath: '/never.js' }),
      } as unknown as ResolverContextLike;

      const webResolution = resolveRequest(context, 'windforge/generated', 'web');
      expect(webResolution.filePath).toContain('generated.web.js');

      // Native platforms still get the native module.
      const iosResolution = resolveRequest(context, 'windforge/generated', 'ios');
      expect(iosResolution.filePath).toContain('generated.js');
      expect(iosResolution.filePath).not.toContain('.web.');
    });

    it('falls back to native module when .web.js does not exist', async () => {
      const outputDir = await tempDir();
      // Only create the native artifact — no web variant.
      await writeFile(join(outputDir, 'generated.js'), '// native only');

      const config = withWindforge({}, { outputDir });
      const resolveRequest = config.resolver?.resolveRequest as (
        context: ResolverContextLike,
        moduleName: string,
        platform: string | null | undefined,
      ) => { type: string; filePath: string };

      const context = {
        resolveRequest: () => ({ type: 'sourceFile', filePath: '/never.js' }),
      } as unknown as ResolverContextLike;

      // Even on web platform, falls back to native when no .web.js exists.
      const resolution = resolveRequest(context, 'windforge/generated', 'web');
      expect(resolution.filePath).toContain('generated.js');
      expect(resolution.filePath).not.toContain('.web.');
    });
  });
});
