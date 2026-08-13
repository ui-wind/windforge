import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AnimationIR, TransitionIR } from '@windforge/ir';
import { buildArtifact } from '../src/artifact.js';
import { compileTailwindCss } from '../src/compile.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/anim');
const ENTRY = resolve(FIXTURE, 'src/global.css');

async function buildFor(candidates: string[]) {
  const { css } = await compileTailwindCss(ENTRY, candidates);
  return buildArtifact(css, 1);
}

describe('transform lowering (Tailwind v4 individual properties)', () => {
  it('rotate-45 lowers to a rotate transform operation', async () => {
    const { artifact } = await buildFor(['rotate-45']);
    expect(artifact.styles['rotate-45'].base).toEqual([
      {
        property: 'transform',
        value: {
          kind: 'transform',
          operations: [{ operation: 'rotate', value: { kind: 'string', value: '45deg' } }],
        },
        priority: 10,
        sourceOrder: 0,
      },
    ]);
  });

  it('scale-105 lowers rule-local --tw-scale-* vars to a uniform scale', async () => {
    const { artifact } = await buildFor(['scale-105']);
    expect(artifact.styles['scale-105'].base[0]?.value).toEqual({
      kind: 'transform',
      operations: [{ operation: 'scale', value: { kind: 'number', value: 1.05 } }],
    });
  });

  it('scale-x-50 lowers to scaleX/scaleY pair (y defaults to 1)', async () => {
    const { artifact } = await buildFor(['scale-x-50']);
    expect(artifact.styles['scale-x-50'].base[0]?.value).toEqual({
      kind: 'transform',
      operations: [
        { operation: 'scaleX', value: { kind: 'number', value: 0.5 } },
        { operation: 'scaleY', value: { kind: 'number', value: 1 } },
      ],
    });
  });

  it('translate-x-4 evaluates calc(var(--spacing) * 4) per axis', async () => {
    const { artifact } = await buildFor(['translate-x-4']);
    expect(artifact.styles['translate-x-4'].base[0]?.value).toEqual({
      kind: 'transform',
      operations: [
        {
          operation: 'translate',
          value: [
            { kind: 'number', value: 16 },
            { kind: 'number', value: 0 },
          ],
        },
      ],
    });
  });

  it('-translate-y-1/4 keeps percentages as unit strings', async () => {
    const { artifact } = await buildFor(['-translate-y-1/4']);
    expect(artifact.styles['-translate-y-1/4'].base[0]?.value).toEqual({
      kind: 'transform',
      operations: [
        {
          operation: 'translate',
          value: [
            { kind: 'number', value: 0 },
            { kind: 'string', value: '-25%' },
          ],
        },
      ],
    });
  });
});

describe('transition lowering', () => {
  it('.transition lowers property list, duration and easing from theme defaults', async () => {
    const { artifact } = await buildFor(['transition']);
    const transition = artifact.styles['transition'].transition;
    expect(transition).toEqual({
      properties: ['color', 'backgroundColor', 'borderColor', 'opacity', 'transform'],
      timingFunction: { kind: 'cubic-bezier', points: [0.4, 0, 0.2, 1] },
      duration: { ms: 150 },
    });
    // Transition metadata rides alone — no RN declarations emitted.
    expect(artifact.styles['transition'].base).toEqual([]);
  });

  it('.transition-colors lowers to the color-family canonical list', async () => {
    const { artifact } = await buildFor(['transition-colors']);
    expect(artifact.styles['transition-colors'].transition?.properties).toEqual([
      'color',
      'backgroundColor',
      'borderColor',
    ]);
  });

  it('duration/ease/delay utilities produce per-field TransitionIR', async () => {
    const { artifact } = await buildFor(['duration-500', 'ease-in-out', 'delay-100']);
    expect(artifact.styles['duration-500'].transition).toEqual({
      properties: 'all',
      duration: { ms: 500 },
    } satisfies TransitionIR);
    expect(artifact.styles['ease-in-out'].transition).toEqual({
      properties: 'all',
      timingFunction: { kind: 'cubic-bezier', points: [0.4, 0, 0.2, 1] },
    } satisfies TransitionIR);
    expect(artifact.styles['delay-100'].transition).toEqual({
      properties: 'all',
      delay: { ms: 100 },
    } satisfies TransitionIR);
  });

  it('transition longhands merge per-field within one rule', () => {
    const css = `
      .fade {
        transition-property: opacity, transform;
        transition-duration: 300ms;
        transition-timing-function: ease-in;
        transition-delay: 50ms;
      }
    `;
    const { artifact } = buildArtifact(css, 1);
    expect(artifact.styles['fade'].transition).toEqual({
      properties: ['opacity', 'transform'],
      duration: { ms: 300 },
      timingFunction: { kind: 'ease-in' },
      delay: { ms: 50 },
    });
  });
});

describe('animation lowering', () => {
  it('animate-spin resolves the built-in spin keyframes', async () => {
    const { artifact } = await buildFor(['animate-spin']);
    expect(artifact.styles['animate-spin'].animation).toEqual({
      name: 'spin',
      keyframes: [
        {
          offset: 1,
          declarations: [
            {
              property: 'transform',
              value: {
                kind: 'transform',
                operations: [{ operation: 'rotate', value: { kind: 'string', value: '360deg' } }],
              },
            },
          ],
        },
      ],
      duration: { ms: 1000 },
      timingFunction: { kind: 'linear' },
      iterationCount: 'infinite',
    } satisfies AnimationIR);
  });

  it('custom @theme animation carries from/50%/to frames with segment easing', async () => {
    const { artifact, diagnostics } = await buildFor(['animate-spin-slow']);
    const animation = artifact.styles['animate-spin-slow'].animation;
    expect(animation?.name).toBe('spin-slow');
    expect(animation?.duration).toEqual({ ms: 1000 });
    expect(animation?.timingFunction).toEqual({ kind: 'linear' });
    expect(animation?.iterationCount).toBe('infinite');

    const frames = animation?.keyframes ?? [];
    expect(frames.map((f) => f.offset)).toEqual([0, 0.5, 1]);
    // from: rotate + opacity; the unlowerable filter decl is dropped.
    expect(frames[0]?.declarations).toEqual([
      {
        property: 'transform',
        value: {
          kind: 'transform',
          operations: [{ operation: 'rotate', value: { kind: 'string', value: '0deg' } }],
        },
      },
      { property: 'opacity', value: { kind: 'number', value: 1 } },
    ]);
    // 50%: animation-timing-function attaches to the segment starting there.
    expect(frames[1]?.easing).toEqual({ kind: 'ease-in' });
    expect(frames[2]?.easing).toBeUndefined();

    // Dropped keyframe declaration → WF1006 naming the property.
    expect(diagnostics.some((d) => d.code === 'WF1006' && d.message.includes('filter'))).toBe(
      true,
    );
  });

  it('unknown @keyframes name emits WF1006 and no animation field', () => {
    const css = `.broken { animation: nonexistent 1s linear; }`;
    const { artifact, diagnostics } = buildArtifact(css, 1);
    expect(artifact.styles['broken']?.animation).toBeUndefined();
    expect(
      diagnostics.some((d) => d.code === 'WF1006' && d.message.includes('nonexistent')),
    ).toBe(true);
  });

  it('animation shorthand resets longhand accumulation (later wins)', () => {
    const css = `
      @keyframes pulse { to { opacity: 0.5; } }
      .loop {
        animation-name: pulse;
        animation-duration: 2s;
        animation: pulse 1s linear infinite;
      }
    `;
    const { artifact } = buildArtifact(css, 1);
    const animation = artifact.styles['loop'].animation;
    // The shorthand overrides the earlier longhands entirely.
    expect(animation?.duration).toEqual({ ms: 1000 });
    expect(animation?.timingFunction).toEqual({ kind: 'linear' });
    expect(animation?.iterationCount).toBe('infinite');
  });

  it('animation: none clears accumulated animation fields', () => {
    const css = `
      @keyframes pulse { to { opacity: 0.5; } }
      .stopped { animation-name: pulse; animation: none; }
    `;
    const { artifact } = buildArtifact(css, 1);
    expect(artifact.styles['stopped']?.animation).toBeUndefined();
  });
});
