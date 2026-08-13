/**
 * Runtime resolution diagnostics.
 *
 * Counters for how classNames are resolved (build-time artifact hits vs.
 * controlled runtime fallback vs. unknown), observable in debug mode per the
 * fallback requirements (AI_AGENT_RULES Rule 9: cached, deterministic,
 * observable, benchmarked). Diagnostic codes:
 *
 * - WF2001: unknown class (no artifact entry, fallback cannot parse it).
 * - WF2002: the controlled runtime fallback resolved a class for the first
 *   time (the class was not present as a source literal at build time).
 *
 * WF0xxx is owned by the CLI, WF1xxx by the tailwind frontend; WF2xxx is the
 * runtime range.
 */

export type RuntimeDiagnostics = {
  /** resolveClassName calls (one per token per resolution attempt). */
  resolves: number;
  cacheHits: number;
  cacheMisses: number;
  /** Tokens resolved by the controlled runtime fallback parser. */
  fallbackParses: number;
  /** Tokens the fallback parser rejected (no artifact entry either). */
  fallbackMisses: number;
  /** Distinct unresolvable tokens seen (deduped, capped). */
  unknownTokens: string[];
};

const UNKNOWN_TOKEN_LIMIT = 100;

let resolves = 0;
let cacheHits = 0;
let cacheMisses = 0;
let fallbackParses = 0;
let fallbackMisses = 0;
const unknownTokens = new Set<string>();

const warned = new Set<string>();
let fallbackNoticeShown = false;

function isDev(): boolean {
  // `__DEV__` is defined by RN/Metro but not by vitest's node environment —
  // the typeof guard keeps tests from throwing a ReferenceError.
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/** Snapshot of the current counters (copy; safe to hold onto). */
export function getRuntimeDiagnostics(): RuntimeDiagnostics {
  return {
    resolves,
    cacheHits,
    cacheMisses,
    fallbackParses,
    fallbackMisses,
    unknownTokens: [...unknownTokens],
  };
}

/** Test-only: zero all counters and warnings. */
export function __resetRuntimeDiagnostics(): void {
  resolves = 0;
  cacheHits = 0;
  cacheMisses = 0;
  fallbackParses = 0;
  fallbackMisses = 0;
  unknownTokens.clear();
  warned.clear();
  fallbackNoticeShown = false;
}

export function recordResolve(): void {
  resolves += 1;
}

export function recordCacheHit(): void {
  cacheHits += 1;
}

export function recordCacheMiss(): void {
  cacheMisses += 1;
}

export function recordFallbackParse(): void {
  fallbackParses += 1;
  if (!fallbackNoticeShown && isDev()) {
    fallbackNoticeShown = true;
    console.warn(
      '[windforge WF2002] runtime fallback resolved a class that was not in the build-time ' +
        'artifact (likely a dynamic string like `p-${n}`). Results are cached; add the class ' +
        'as a source literal to resolve it at build time instead.',
    );
  }
}

export function recordFallbackMiss(token: string): void {
  fallbackMisses += 1;
  if (unknownTokens.size < UNKNOWN_TOKEN_LIMIT) unknownTokens.add(token);
  if (!warned.has(token) && isDev()) {
    warned.add(token);
    console.warn(
      `[windforge WF2001] unknown class "${token}" — not in the build-time artifact and ` +
        'outside the runtime fallback subset; it will be skipped.',
    );
  }
}
