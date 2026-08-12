import { describe, expect, it } from 'vitest';

import { withWindforge } from '../src/index.js';
import type { ResolverContextLike } from '../src/resolver.js';

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
});
