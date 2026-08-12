/**
 * Deterministic hashing of canonical IR.
 *
 * Equivalent IR produces the same hash; debug metadata is ignored unless
 * explicitly included. Implemented as FNV-1a over the canonical string so the
 * package keeps zero dependencies (no node:crypto import), which matters
 * because the IR may be consumed by web-side build tooling.
 */
import { toCanonicalJson, toCanonicalString, type CanonicalOptions } from './canonical.js';
import type { StyleIR } from './ir.js';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Math.imul keeps the multiply in 32-bit integer space.
    hash = Math.imul(hash, FNV_PRIME);
  }
  // Convert to unsigned 32-bit.
  return hash >>> 0;
}

/**
 * Stable 8-hex-char hash of a StyleIR document. Equivalent documents hash
 * identically regardless of key insertion order or metadata.
 */
export function hashIR(ir: StyleIR, options?: CanonicalOptions): string {
  return fnv1a(toCanonicalString(ir, options)).toString(16).padStart(8, '0');
}

/** Hash any JSON-compatible sub-structure (values, conditions, animations). */
export function hashCanonical(value: unknown): string {
  return fnv1a(toCanonicalJson(value)).toString(16).padStart(8, '0');
}
