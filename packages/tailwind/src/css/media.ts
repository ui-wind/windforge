/**
 * @media query → ConditionSpec lowering.
 *
 * Supported today: prefers-color-scheme, width ranges (>= / <=), orientation.
 * Pointer-capability queries (`@media (hover: hover)`) are capability gates
 * that the runtime cannot evaluate. By default they fail the parse (the
 * caller turns the reason into a diagnostic); with
 * `transparentPointerCaps` the collector instead treats them as no-op
 * wrappers — Tailwind wraps every `hover:`/`group-hover:` utility in
 * `@media (hover: hover)`, and the interaction state itself is delivered by
 * the runtime's component state, not by a capability condition.
 */
import type { ConditionSpec, Diagnostic } from '../types.js';
import { REM_PX } from './resolve.js';

type AnyRecord = Record<string, unknown>;

export type MediaParseOptions = {
  /** Drop pointer-capability features instead of failing on them. A query
   * made only of pointer caps parses to zero conditions with
   * `pointerOnly: true`. */
  transparentPointerCaps?: boolean;
};

export type MediaParseResult =
  | { ok: true; conditions: ConditionSpec[]; pointerOnly?: boolean }
  | { ok: false; reason: string };

function lengthToPx(value: AnyRecord): number | null {
  // { type: 'length', value: { type: 'value', value: { unit, value } } }
  let node = value.value as AnyRecord | undefined;
  while (node && (node.type === 'length' || node.type === 'value')) {
    node = node.value as AnyRecord | undefined;
  }
  if (!node || typeof node.unit !== 'string') return null;
  if (node.unit === 'px') return node.value as number;
  if (node.unit === 'rem') return (node.value as number) * REM_PX;
  return null;
}

function parseFeatureCondition(
  condition: AnyRecord,
  options?: MediaParseOptions,
): MediaParseResult {
  const value = condition.value as AnyRecord | undefined;
  if (!value) return { ok: false, reason: 'empty media feature' };

  if (value.type === 'plain') {
    const name = value.name as string;
    const ident = ((value.value as AnyRecord)?.value as string) ?? '';
    if (name === 'prefers-color-scheme') {
      if (ident === 'dark' || ident === 'light') {
        return { ok: true, conditions: [{ kind: 'color-scheme', scheme: ident }] };
      }
      return { ok: false, reason: `prefers-color-scheme: ${ident}` };
    }
    if (name === 'orientation') {
      if (ident === 'portrait' || ident === 'landscape') {
        return { ok: true, conditions: [{ kind: 'orientation', orientation: ident }] };
      }
      return { ok: false, reason: `orientation: ${ident}` };
    }
    // Windforge convention: @custom-variant ios (@media (platform: ios)).
    if (name === 'platform') {
      if (
        ident === 'ios' ||
        ident === 'android' ||
        ident === 'web' ||
        ident === 'native'
      ) {
        return { ok: true, conditions: [{ kind: 'platform', platform: ident }] };
      }
      return { ok: false, reason: `platform: ${ident}` };
    }
    // Windforge convention: @custom-variant rtl (@media (layout-direction: rtl)).
    if (name === 'layout-direction') {
      if (ident === 'ltr' || ident === 'rtl') {
        return { ok: true, conditions: [{ kind: 'layout-direction', direction: ident }] };
      }
      return { ok: false, reason: `layout-direction: ${ident}` };
    }
    if (name === 'hover' || name === 'pointer' || name === 'any-hover' || name === 'any-pointer') {
      if (options?.transparentPointerCaps) {
        return { ok: true, conditions: [], pointerOnly: true };
      }
      return { ok: false, reason: `pointer-capability query (${name})` };
    }
    return { ok: false, reason: `media feature ${name}` };
  }

  if (value.type === 'range') {
    const name = value.name as string;
    const operator = value.operator as string;
    if (name !== 'width') {
      return { ok: false, reason: `range media feature ${name}` };
    }
    const px = lengthToPx(value as AnyRecord);
    if (px === null) return { ok: false, reason: `unsupported length in range query` };
    if (operator === 'greater-than-equal') {
      return { ok: true, conditions: [{ kind: 'media-width', operator: '>=', px }] };
    }
    if (operator === 'less-than-equal') {
      return { ok: true, conditions: [{ kind: 'media-width', operator: '<=', px }] };
    }
    return { ok: false, reason: `strict comparison "${operator}" in width query` };
  }

  return { ok: false, reason: `unsupported media condition ${value.type}` };
}

/**
 * Parse a lightningcss media rule value (`{ mediaQueries: [...] }`) into
 * condition specs. Tailwind emits one condition per @media block; comma-
 * separated (OR) lists are rejected.
 */
export function parseMediaQuery(
  mediaRuleValue: AnyRecord,
  options?: MediaParseOptions,
): MediaParseResult {
  const queries = mediaRuleValue.mediaQueries as AnyRecord[] | undefined;
  if (!queries || queries.length === 0) {
    return { ok: false, reason: 'empty @media rule' };
  }
  if (queries.length > 1) {
    return { ok: false, reason: 'comma-separated (OR) media queries' };
  }
  const query = queries[0] as AnyRecord;
  const condition = query.condition as AnyRecord | undefined;
  if (!condition) return { ok: false, reason: 'media query without condition' };
  if (condition.type === 'not' || condition.type === 'or') {
    return { ok: false, reason: `${condition.type} media condition` };
  }
  if (condition.type === 'and') {
    const parts = condition.conditions as AnyRecord[] | undefined;
    if (!parts) return { ok: false, reason: 'empty and-condition' };
    const conditions: ConditionSpec[] = [];
    let pointerOnly = true;
    for (const part of parts) {
      const parsed = parseFeatureCondition(part, options);
      if (!parsed.ok) return parsed;
      conditions.push(...parsed.conditions);
      if (!parsed.pointerOnly) pointerOnly = false;
    }
    const result: MediaParseResult = { ok: true, conditions };
    if (pointerOnly) (result as { pointerOnly?: boolean }).pointerOnly = true;
    return result;
  }
  return parseFeatureCondition(condition, options);
}

/** True when the failure is a pointer-capability query (hover: etc.). */
export function isPointerCapabilityFailure(result: MediaParseResult): boolean {
  return !result.ok && result.reason.startsWith('pointer-capability');
}

export function mediaDiagnostic(result: MediaParseResult): Diagnostic {
  const reason = result.ok ? 'unknown' : result.reason;
  if (reason.startsWith('pointer-capability')) {
    return {
      code: 'WF1004',
      message:
        'Pointer-capability @media conditions are not runtime-evaluable; rule skipped',
    };
  }
  return {
    code: 'WF1004',
    message: `Unsupported @media query (${reason}); rule skipped`,
  };
}
