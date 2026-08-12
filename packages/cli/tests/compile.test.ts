import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashIR, toCanonicalString, type StyleIR } from '@windforge/ir';
import { afterAll, describe, expect, it } from 'vitest';

import { CompileError, compileFile } from '../src/index.js';

const IR_PKG_DIR = fileURLToPath(new URL('../../ir', import.meta.url));
const FIXTURE = join(IR_PKG_DIR, 'fixtures', 'static-utility.json');

const scratch = mkdtempSync(join(tmpdir(), 'windforge-cli-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('compileFile', () => {
  it('compiles a fixture to canonical form with a deterministic hash', () => {
    const result = compileFile({ input: FIXTURE });
    const doc = JSON.parse(readFileSync(FIXTURE, 'utf8')) as StyleIR;
    expect(result.canonical).toBe(toCanonicalString(doc));
    expect(result.hash).toBe(hashIR(doc));
    expect(result.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces the same hash across repeated runs', () => {
    const a = compileFile({ input: FIXTURE });
    const b = compileFile({ input: FIXTURE });
    expect(a.hash).toBe(b.hash);
    expect(a.canonical).toBe(b.canonical);
  });

  it('rejects invalid JSON with diagnostic WF0001', () => {
    const path = join(scratch, 'bad.json');
    writeFileSync(path, '{ not json', 'utf8');
    expect(() => compileFile({ input: path })).toThrowError(CompileError);
    try {
      compileFile({ input: path });
    } catch (error) {
      expect((error as CompileError).diagnostic.code).toBe('WF0001');
    }
  });

  it('rejects a non-IR document with diagnostic WF0002', () => {
    const path = join(scratch, 'not-ir.json');
    writeFileSync(path, JSON.stringify({ hello: 'world' }), 'utf8');
    try {
      compileFile({ input: path });
      throw new Error('expected CompileError');
    } catch (error) {
      expect((error as CompileError).diagnostic.code).toBe('WF0002');
    }
  });

  it('warns on IR version mismatch (WF0003)', () => {
    const path = join(scratch, 'future.json');
    writeFileSync(
      path,
      JSON.stringify({ version: 99, declarations: [] }),
      'utf8',
    );
    const result = compileFile({ input: path });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('WF0003');
  });
});
