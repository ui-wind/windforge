/**
 * Canonical serialization.
 *
 * Produces a single canonical JSON string for an IR document. Equivalent IR
 * MUST serialize identically regardless of key insertion order, optional
 * field omission, or debug metadata. This string is the input to hashing,
 * fixture snapshots and backend acceptance checks.
 *
 * Rules:
 * - object keys sorted lexicographically at every depth
 * - undefined values omitted
 * - metadata stripped unless explicitly retained
 * - arrays preserve order (order is semantic for declarations, transforms,
 *   keyframes)
 */
import type { StyleIR } from './ir.js';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Strip keys whose value is undefined; recurse into plain objects/arrays. */
function normalize(input: unknown): JsonValue | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  const t = typeof input;
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return input as JsonValue;
  }
  if (Array.isArray(input)) {
    return input.map((item) => normalize(item) ?? null);
  }
  if (t === 'object') {
    const out: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(input as Record<string, unknown>).sort()) {
      const value = normalize((input as Record<string, unknown>)[key]);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }
  throw new Error(`@windforge/ir: cannot canonicalize value of type ${t}`);
}

export type CanonicalOptions = {
  /**
   * Retain `metadata` in the canonical string. Off by default: hashing must
   * ignore source file path, line and debug-only metadata per the IR spec.
   */
  includeMetadata?: boolean;
};

/** Canonical JSON for any JSON-compatible value (used for sub-structures). */
export function toCanonicalJson(value: unknown, options?: CanonicalOptions): string {
  const normalized = normalize(value);
  if (normalized === undefined) return 'null';
  if (!options?.includeMetadata && isDocument(normalized)) {
    const { metadata: _metadata, ...rest } = normalized;
    return JSON.stringify(rest);
  }
  return JSON.stringify(normalized);
}

function isDocument(
  value: JsonValue,
): value is { [key: string]: JsonValue; metadata?: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'version' in value && 'declarations' in value;
}

/** Canonical JSON for a full StyleIR document. */
export function toCanonicalString(ir: StyleIR, options?: CanonicalOptions): string {
  return toCanonicalJson(ir, options);
}
