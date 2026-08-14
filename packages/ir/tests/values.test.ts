import { describe, expect, it } from 'vitest';

import { classifyValue, type IRValue } from '../src/index.js';

describe('classifyValue', () => {
  const cases: Array<[IRValue, ReturnType<typeof classifyValue>]> = [
    [{ kind: 'number', value: 16 }, 'STATIC'],
    [{ kind: 'string', value: 'center' }, 'STATIC'],
    [{ kind: 'color', value: '#09090b' }, 'STATIC'],
    [{ kind: 'dimension', value: 1, unit: 'rem' }, 'STATIC'],
    [{ kind: 'token', ref: 'colors.primary' }, 'TOKEN'],
    [{ kind: 'variable', name: '--wf-primary' }, 'TOKEN'],
    [{ kind: 'calc', expression: '100% - 16px' }, 'TOKEN'],
    [
      {
        kind: 'conditional',
        conditionId: 'c-dark',
        value: { kind: 'color', value: '#000' },
      },
      'CONDITIONAL',
    ],
    [{ kind: 'runtime', ref: 'animated.opacity' }, 'RUNTIME'],
    [{ kind: 'safe-area', inset: 'left' }, 'RUNTIME'],
  ];

  for (const [value, expected] of cases) {
    it(`classifies ${value.kind} as ${expected}`, () => {
      expect(classifyValue(value)).toBe(expected);
    });
  }

  it('takes the highest classification inside a list', () => {
    const list: IRValue = {
      kind: 'list',
      items: [
        { kind: 'number', value: 1 },
        { kind: 'token', ref: 'colors.primary' },
        { kind: 'number', value: 2 },
      ],
    };
    expect(classifyValue(list)).toBe('TOKEN');
  });

  it('takes the highest classification inside a transform', () => {
    const transform: IRValue = {
      kind: 'transform',
      operations: [
        { operation: 'scale', value: { kind: 'number', value: 1 } },
        { operation: 'translateX', value: { kind: 'runtime', ref: 'tx' } },
      ],
    };
    expect(classifyValue(transform)).toBe('RUNTIME');
  });
});
