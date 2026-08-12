/**
 * `windforge compile` — Phase 0 skeleton.
 *
 * Phase 0 compiles IR fixture documents: parse, validate the IR shape, emit
 * the canonical serialization and its deterministic hash. Phase 1 replaces
 * the fixture input with the real pipeline (source discovery → Tailwind v4
 * compile → CSS AST → Style IR).
 */
import { readFileSync } from 'node:fs';

import {
  hashIR,
  IR_VERSION,
  toCanonicalString,
  type StyleIR,
} from '@windforge/ir';

import type { Diagnostic } from '../diagnostics.js';

export type CompileInput = {
  /** Path to an IR fixture document. */
  input: string;
};

export type CompileResult = {
  ir: StyleIR;
  canonical: string;
  hash: string;
  diagnostics: Diagnostic[];
};

export function compileFile(options: CompileInput): CompileResult {
  const diagnostics: Diagnostic[] = [];
  const raw = readFileSync(options.input, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CompileError({
      severity: 'error',
      code: 'WF0001',
      message: `invalid JSON: ${(error as Error).message}`,
      file: options.input,
    });
  }

  const ir = parsed as StyleIR;
  if (typeof ir !== 'object' || ir === null || !Array.isArray(ir.declarations)) {
    throw new CompileError({
      severity: 'error',
      code: 'WF0002',
      message: 'document is not a valid StyleIR (missing declarations array)',
      file: options.input,
    });
  }
  if (ir.version !== IR_VERSION) {
    diagnostics.push({
      severity: 'warning',
      code: 'WF0003',
      message: `document IR version ${ir.version} differs from current version ${IR_VERSION}`,
      file: options.input,
    });
  }

  return {
    ir,
    canonical: toCanonicalString(ir),
    hash: hashIR(ir),
    diagnostics,
  };
}

export class CompileError extends Error {
  constructor(public readonly diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.name = 'CompileError';
  }
}
