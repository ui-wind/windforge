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

describe('interactive variants (Phase 11)', () => {
  it('pseudo states lower to state conditions', async () => {
    const { artifact } = await buildFor([
      'hover:bg-red-500',
      'active:bg-red-500',
      'focus:bg-red-500',
      'disabled:opacity-50',
    ]);
    expect(artifact.styles['hover:bg-red-500'].variants?.[0]?.conditionIds).toEqual(['state:hover']);
    expect(artifact.styles['active:bg-red-500'].variants?.[0]?.conditionIds).toEqual(['state:active']);
    expect(artifact.styles['focus:bg-red-500'].variants?.[0]?.conditionIds).toEqual(['state:focus']);
    expect(artifact.styles['disabled:opacity-50'].variants?.[0]?.conditionIds).toEqual(['state:disabled']);
    expect(artifact.dependencies['hover:bg-red-500']).toEqual(['state:hover']);
  });

  it('focus-visible collapses to the focus state', async () => {
    const { artifact } = await buildFor(['focus-visible:bg-red-500']);
    expect(artifact.styles['focus-visible:bg-red-500'].variants?.[0]?.conditionIds).toEqual([
      'state:focus',
    ]);
  });

  it('group variants lower to grouped state conditions', async () => {
    const { artifact } = await buildFor([
      'group-hover:bg-red-500',
      'group-active:bg-red-500',
      'group-hover/sidebar:bg-red-500',
    ]);
    expect(artifact.styles['group-hover:bg-red-500'].variants?.[0]?.conditionIds).toEqual([
      'state:hover:group',
    ]);
    expect(artifact.styles['group-active:bg-red-500'].variants?.[0]?.conditionIds).toEqual([
      'state:active:group',
    ]);
    expect(
      artifact.styles['group-hover/sidebar:bg-red-500'].variants?.[0]?.conditionIds,
    ).toEqual(['state:hover:group:sidebar']);
    expect(artifact.conditions).toContainEqual({
      kind: 'state',
      id: 'state:hover:group:sidebar',
      state: 'hover',
      group: true,
      groupName: 'sidebar',
    });
    expect(artifact.dependencies['group-hover/sidebar:bg-red-500']).toEqual([
      'state:hover:group:sidebar',
    ]);
  });

  it('data variants lower to data conditions (presence and exact match)', async () => {
    const { artifact } = await buildFor([
      'data-[open]:bg-cyan-500',
      'data-[selected=true]:bg-emerald-500',
    ]);
    expect(artifact.styles['data-[open]:bg-cyan-500'].variants?.[0]?.conditionIds).toEqual([
      'data:open',
    ]);
    expect(
      artifact.styles['data-[selected=true]:bg-emerald-500'].variants?.[0]?.conditionIds,
    ).toEqual(['data:selected=true']);
    expect(artifact.conditions).toContainEqual({ kind: 'data', id: 'data:open', name: 'open' });
    expect(artifact.conditions).toContainEqual({
      kind: 'data',
      id: 'data:selected=true',
      name: 'selected',
      value: 'true',
    });
  });

  it('stacks interactive variants with environment variants', async () => {
    const { artifact } = await buildFor(['hover:dark:bg-red-700']);
    const ids = artifact.styles['hover:dark:bg-red-700'].variants?.[0]?.conditionIds ?? [];
    expect([...ids].sort()).toEqual(['color-scheme:dark', 'state:hover']);
  });

  it('still skips unsupported pseudo states with one deduplicated WF1004', async () => {
    const { css } = await compileTailwindCss(ENTRY, ['visited:bg-purple-500', 'visited:text-white']);
    const { artifact, diagnostics } = buildArtifact(css, 1);
    expect(artifact.styles['visited:bg-purple-500']).toBeUndefined();
    expect(artifact.styles['visited:text-white']).toBeUndefined();
    expect(diagnostics.filter((d) => d.code === 'WF1004')).toHaveLength(1);
  });
});

describe('interactive condition specs', () => {
  it('emits deterministic state ids, including group scoping', () => {
    expect(conditionId({ kind: 'state', state: 'hover' })).toBe('state:hover');
    expect(conditionId({ kind: 'state', state: 'hover', group: true })).toBe('state:hover:group');
    expect(
      conditionId({ kind: 'state', state: 'hover', group: true, groupName: 'sidebar' }),
    ).toBe('state:hover:group:sidebar');
    expect(
      specToConditionIR({ kind: 'state', state: 'active', group: true, groupName: 'card' }),
    ).toEqual({
      kind: 'state',
      id: 'state:active:group:card',
      state: 'active',
      group: true,
      groupName: 'card',
    });
  });

  it('emits deterministic data ids for presence and exact match', () => {
    expect(conditionId({ kind: 'data', name: 'open' })).toBe('data:open');
    expect(conditionId({ kind: 'data', name: 'selected', value: 'true' })).toBe('data:selected=true');
    expect(specToConditionIR({ kind: 'data', name: 'open' })).toEqual({
      kind: 'data',
      id: 'data:open',
      name: 'open',
    });
    expect(specToConditionIR({ kind: 'data', name: 'selected', value: 'true' })).toEqual({
      kind: 'data',
      id: 'data:selected=true',
      name: 'selected',
      value: 'true',
    });
  });
});
