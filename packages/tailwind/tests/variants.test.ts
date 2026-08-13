import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildArtifact } from '../src/artifact.js';
import { compileTailwindCss } from '../src/compile.js';
import { conditionId, specToConditionIR } from '../src/types.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/rtl');
const ENTRY = resolve(FIXTURE, 'src/global.css');

async function buildFor(candidates: string[]) {
  const { css } = await compileTailwindCss(ENTRY, candidates);
  return buildArtifact(css, 1);
}

describe('layout-direction variants (rtl:/ltr:)', () => {
  it('rtl: lowers to a layout-direction condition', async () => {
    const { artifact } = await buildFor(['rtl:bg-red-500']);
    const entry = artifact.styles['rtl:bg-red-500'];
    expect(entry.variants?.[0]?.conditionIds).toEqual(['layout-direction:rtl']);
    expect(
      artifact.conditions.some(
        (c) => c.kind === 'layout-direction' && c.id === 'layout-direction:rtl',
      ),
    ).toBe(true);
    expect(artifact.dependencies['rtl:bg-red-500']).toEqual(['layout-direction:rtl']);
  });

  it('ltr: lowers to the ltr condition', async () => {
    const { artifact } = await buildFor(['ltr:bg-white']);
    expect(artifact.styles['ltr:bg-white'].variants?.[0]?.conditionIds).toEqual([
      'layout-direction:ltr',
    ]);
  });

  it('combines with other variants (and-condition)', async () => {
    const { artifact } = await buildFor(['dark:rtl:bg-white']);
    const ids = artifact.styles['dark:rtl:bg-white'].variants?.[0]?.conditionIds ?? [];
    expect([...ids].sort()).toEqual(['color-scheme:dark', 'layout-direction:rtl']);
    expect(artifact.dependencies['dark:rtl:bg-white'].sort()).toEqual([
      'color-scheme:dark',
      'layout-direction:rtl',
    ]);
  });

  it('rejects unknown layout-direction values with WF1004', async () => {
    const { css } = await compileTailwindCss(ENTRY, ['bad:bg-white']);
    const { artifact, diagnostics } = buildArtifact(css, 1);
    expect(artifact.styles['bad:bg-white']).toBeUndefined();
    expect(diagnostics.some((d) => d.code === 'WF1004')).toBe(true);
  });
});

describe('layout-direction condition specs', () => {
  it('emits deterministic ids and IR', () => {
    const spec = { kind: 'layout-direction', direction: 'rtl' } as const;
    expect(conditionId(spec)).toBe('layout-direction:rtl');
    expect(specToConditionIR(spec)).toEqual({
      kind: 'layout-direction',
      id: 'layout-direction:rtl',
      direction: 'rtl',
    });
  });
});
