import { describe, expect, it } from 'vitest';

import {
  hashIR,
  IR_VERSION,
  toCanonicalString,
  type StyleIR,
} from '../src/index.js';

function ir(partial: Partial<StyleIR>): StyleIR {
  return { version: IR_VERSION, declarations: [], ...partial };
}

describe('toCanonicalString', () => {
  it('ignores key insertion order', () => {
    const a = ir({
      declarations: [
        {
          property: 'padding',
          value: { kind: 'number', value: 16 },
          priority: 1,
          sourceOrder: 0,
        },
      ],
    });
    const b: StyleIR = {
      version: IR_VERSION,
      declarations: [
        {
          sourceOrder: 0,
          value: { value: 16, kind: 'number' },
          property: 'padding',
          priority: 1,
        },
      ],
    };
    expect(toCanonicalString(a)).toBe(toCanonicalString(b));
  });

  it('omits undefined optional fields', () => {
    const withUndefined = ir({
      declarations: [{ property: 'opacity', value: { kind: 'number', value: 0.5 }, priority: undefined }],
    });
    const without = ir({
      declarations: [{ property: 'opacity', value: { kind: 'number', value: 0.5 } }],
    });
    expect(toCanonicalString(withUndefined)).toBe(toCanonicalString(without));
  });

  it('strips metadata by default', () => {
    const doc = ir({
      declarations: [{ property: 'color', value: { kind: 'color', value: '#09090b' } }],
      metadata: { source: 'app/Home.tsx', line: 12, candidates: ['bg-zinc-950'] },
    });
    expect(toCanonicalString(doc)).not.toContain('Home.tsx');
    expect(toCanonicalString(doc, { includeMetadata: true })).toContain('Home.tsx');
  });

  it('preserves declaration order (order is semantic)', () => {
    const a = ir({
      declarations: [
        { property: 'padding', value: { kind: 'number', value: 16 } },
        { property: 'backgroundColor', value: { kind: 'color', value: '#000' } },
      ],
    });
    const b = ir({
      declarations: [
        { property: 'backgroundColor', value: { kind: 'color', value: '#000' } },
        { property: 'padding', value: { kind: 'number', value: 16 } },
      ],
    });
    expect(toCanonicalString(a)).not.toBe(toCanonicalString(b));
  });
});

describe('hashIR', () => {
  it('produces stable hashes for equivalent IR', () => {
    const a = ir({
      declarations: [{ property: 'gap', value: { kind: 'number', value: 8 } }],
    });
    const b = ir({
      declarations: [{ value: { kind: 'number', value: 8 }, property: 'gap' }],
    });
    expect(hashIR(a)).toBe(hashIR(b));
    expect(hashIR(a)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('ignores debug metadata changes', () => {
    const base = ir({
      declarations: [{ property: 'color', value: { kind: 'color', value: '#fff' } }],
    });
    const withMeta: StyleIR = {
      ...base,
      metadata: { source: 'a.tsx', line: 1 },
    };
    const withOtherMeta: StyleIR = {
      ...base,
      metadata: { source: 'b.tsx', line: 99 },
    };
    expect(hashIR(withMeta)).toBe(hashIR(base));
    expect(hashIR(withOtherMeta)).toBe(hashIR(base));
  });

  it('includes metadata when explicitly requested', () => {
    const base = ir({
      declarations: [{ property: 'color', value: { kind: 'color', value: '#fff' } }],
    });
    const withMeta: StyleIR = { ...base, metadata: { source: 'a.tsx' } };
    expect(hashIR(withMeta, { includeMetadata: true })).not.toBe(hashIR(base, { includeMetadata: true }));
  });

  it('differs when a value differs', () => {
    const a = ir({ declarations: [{ property: 'padding', value: { kind: 'number', value: 16 } }] });
    const b = ir({ declarations: [{ property: 'padding', value: { kind: 'number', value: 24 } }] });
    expect(hashIR(a)).not.toBe(hashIR(b));
  });

  it('differs when a condition differs', () => {
    const a = ir({
      declarations: [],
      conditions: [{ kind: 'color-scheme', id: 'c1', scheme: 'dark' }],
    });
    const b = ir({
      declarations: [],
      conditions: [{ kind: 'color-scheme', id: 'c1', scheme: 'light' }],
    });
    expect(hashIR(a)).not.toBe(hashIR(b));
  });

  it('hashes layout-direction conditions stably and distinctly', () => {
    const rtl = ir({
      declarations: [],
      conditions: [{ kind: 'layout-direction', id: 'layout-direction:rtl', direction: 'rtl' }],
    });
    const rtlReordered = ir({
      declarations: [],
      conditions: [{ direction: 'rtl', kind: 'layout-direction', id: 'layout-direction:rtl' }],
    });
    expect(hashIR(rtl)).toBe(hashIR(rtlReordered));
    const ltr = ir({
      declarations: [],
      conditions: [{ kind: 'layout-direction', id: 'layout-direction:ltr', direction: 'ltr' }],
    });
    expect(hashIR(ltr)).not.toBe(hashIR(rtl));
  });
});
