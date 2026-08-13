/**
 * Animation metadata lowering.
 *
 * Tailwind emits `animation: var(--animate-spin)` as unparsed tokens; after
 * build-time var substitution the token list is the CSS animation shorthand
 * (`spin 1s linear infinite`), parsed here into AnimationIR. Keyframes come
 * from `collectKeyframes()` and attach to the animation by name.
 * Unresolvable animations emit WF1006 and are dropped (Rule 9: no runtime
 * animation parser — the build path is the only source).
 */
import type {
  AnimationDirection,
  AnimationFillMode,
  AnimationIR,
  KeyframeIR,
  TimingFunctionIR,
} from '@windforge/ir';
import type { Diagnostic } from '../types.js';
import { printTokens, scalarValue, type CssToken } from './token-print.js';

type AnyRecord = Record<string, unknown>;

const DIRECTIONS = new Set<AnimationDirection>([
  'normal',
  'reverse',
  'alternate',
  'alternate-reverse',
]);

const FILL_MODES = new Set<AnimationFillMode>(['none', 'forwards', 'backwards', 'both']);

function round4(value: number): number {
  // lightningcss float noise (0.4000000059604645) must not leak into IR.
  return Number(value.toFixed(4));
}

function numberTokens(tokens: CssToken[]): number[] | null {
  const out: number[] = [];
  for (const token of tokens) {
    if (token.type === 'white-space' || token.type === 'comma') continue;
    const num = Number(scalarValue(token));
    if (Number.isNaN(num)) return null;
    out.push(num);
  }
  return out;
}

/** Lower a single easing value (typed AST node or token). */
export function lowerEasing(value: AnyRecord): TimingFunctionIR | null {
  const type = value.type as string;
  if (type === 'linear' || type === 'ease' || type === 'ease-in' || type === 'ease-out' || type === 'ease-in-out') {
    return { kind: type };
  }
  if (type === 'cubic-bezier') {
    const x1 = value.x1 as number | undefined;
    const y1 = value.y1 as number | undefined;
    const x2 = value.x2 as number | undefined;
    const y2 = value.y2 as number | undefined;
    if (
      typeof x1 !== 'number' ||
      typeof y1 !== 'number' ||
      typeof x2 !== 'number' ||
      typeof y2 !== 'number'
    ) {
      return null;
    }
    return { kind: 'cubic-bezier', points: [round4(x1), round4(y1), round4(x2), round4(y2)] };
  }
  if (type === 'steps') {
    const steps = (value.steps as number | undefined) ?? undefined;
    const position = typedIdentValue(value.position) ?? 'end';
    if (typeof steps !== 'number' || steps < 1) return null;
    return {
      kind: 'steps',
      steps: Math.round(steps),
      jump: position === 'start' ? 'start' : 'end',
    };
  }
  if (type === 'function') {
    // Token shape: { type: 'function', value: { name, arguments } }
    const name = (value.value as AnyRecord)?.name as string | undefined;
    const args = ((value.value as AnyRecord)?.arguments as CssToken[] | undefined) ?? [];
    if (name === 'cubic-bezier') {
      const numbers = numberTokens(args);
      if (!numbers || numbers.length !== 4) return null;
      return { kind: 'cubic-bezier', points: numbers.map(round4) as [number, number, number, number] };
    }
    if (name === 'steps') {
      const significant = args.filter((t) => t.type !== 'white-space');
      const first = significant[0];
      const steps = first ? Number(scalarValue(first)) : NaN;
      if (Number.isNaN(steps) || steps < 1) return null;
      const second = significant[1];
      const jump =
        second && scalarValue(second) === 'start' ? ('start' as const) : ('end' as const);
      return { kind: 'steps', steps: Math.round(steps), jump };
    }
  }
  if (type === 'ident') {
    const ident = scalarValue(value as CssToken);
    if (typeof ident === 'string') return easingFromIdent(ident);
  }
  return null;
}

function easingFromIdent(ident: string): TimingFunctionIR | null {
  switch (ident) {
    case 'linear':
    case 'ease':
    case 'ease-in':
    case 'ease-out':
    case 'ease-in-out':
      return { kind: ident };
    default:
      return null;
  }
}

/** Typed `steps` positions come as typed idents: { position: { value: {ident} } }. */
function typedIdentValue(value: unknown): string | null {
  const record = value as AnyRecord | undefined;
  if (!record || typeof record !== 'object') return null;
  if (typeof record.value === 'string') return record.value;
  const inner = record.value as AnyRecord | undefined;
  if (inner && typeof inner.value === 'string') return inner.value;
  return null;
}

/** Lower an easing from either a typed declaration value or substituted tokens. */
export function lowerTimingFunction(value: unknown): TimingFunctionIR | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    // Typed shorthand value: take the first easing entry (single-valued in
    // every stylesheet we lower — P0 scope).
    for (const entry of value) {
      const ir = lowerEasing(entry as AnyRecord);
      if (ir) return ir;
    }
    return null;
  }
  return lowerEasing(value as AnyRecord);
}

/** Token-list (unparsed, post var substitution) easing. */
export function timingFunctionFromTokens(tokens: CssToken[]): TimingFunctionIR | null {
  const significant = tokens.filter((t) => t.type !== 'white-space');
  if (significant.length === 1) {
    const only = significant[0] as CssToken;
    if (only.type === 'ident') {
      const ident = scalarValue(only);
      if (typeof ident === 'string') return easingFromIdent(ident);
    }
    return lowerEasing(only);
  }
  return null;
}

/** Parse a time value (typed token list or single token) to milliseconds. */
export function timeMsFromValue(value: unknown): number | null {
  return Array.isArray(value) ? timeMsFromTokens(value as CssToken[]) : null;
}

/** Single significant time token → milliseconds, else null. */
export function timeMsFromTokens(tokens: CssToken[]): number | null {
  const significant = tokens.filter((t) => {
    const token = t as CssToken;
    return token.type !== 'white-space' && token.type !== 'comma';
  });
  if (significant.length !== 1) return null;
  return timeMsFromToken(significant[0] as CssToken);
}

function timeMsFromToken(token: CssToken): number | null {
  const record = token.value as AnyRecord | undefined;
  // Wrapped: { type: 'time', value: { type: 'seconds'|'milliseconds', value } }
  if (token.type === 'time') {
    const unit = record?.type as string | undefined;
    const amount = record?.value as number | undefined;
    if (typeof amount !== 'number') return null;
    if (unit === 'seconds') return round4(amount * 1000);
    if (unit === 'milliseconds') return round4(amount);
    return null;
  }
  // Bare: { type: 'seconds'|'milliseconds', value: number }
  if (token.type === 'seconds' || token.type === 'milliseconds') {
    const amount =
      typeof token.value === 'number'
        ? token.value
        : ((record?.value as number | undefined) ?? undefined);
    if (typeof amount !== 'number') return null;
    return token.type === 'seconds' ? round4(amount * 1000) : round4(amount);
  }
  // Dimension fallback: { unit, value } (e.g. hand-written `0.5s`).
  if (token.type === 'dimension' || token.type === 'length') {
    const dimension = (record?.value ?? record) as AnyRecord | undefined;
    const unit = dimension?.unit as string | undefined;
    const amount = dimension?.value as number | undefined;
    if (typeof amount !== 'number') return null;
    if (unit === 's') return round4(amount * 1000);
    if (unit === 'ms') return round4(amount);
  }
  return null;
}

export type AnimationShorthand = {
  name?: string;
  durationMs?: number;
  delayMs?: number;
  timingFunction?: TimingFunctionIR;
  iterationCount?: number | 'infinite';
  direction?: AnimationDirection;
  fillMode?: AnimationFillMode;
};

/**
 * Parse the CSS animation shorthand from substituted tokens.
 * Order-independent where CSS allows it: the first time value is the
 * duration, the second is the delay; the first bare ident is the name.
 */
export function parseAnimationShorthand(tokens: CssToken[]): AnimationShorthand | null {
  const out: AnimationShorthand = {};
  let firstTime = true;
  let identSeen = false;
  for (const token of tokens) {
    if (token.type === 'white-space') continue;
    const record = token.value as AnyRecord | undefined;

    if (token.type === 'time') {
      const ms = timeMsFromToken(token);
      if (ms === null) return null;
      if (firstTime) {
        out.durationMs = ms;
        firstTime = false;
      } else {
        out.delayMs = ms;
      }
      continue;
    }
    if (token.type === 'number') {
      // The shorthand's single number is the iteration count.
      const num = Number(scalarValue(token));
      if (Number.isNaN(num) || num < 0 || out.iterationCount !== undefined) return null;
      out.iterationCount = num;
      continue;
    }
    if (token.type === 'ident') {
      const ident = String(scalarValue(token) ?? '');
      if (ident === 'infinite') {
        out.iterationCount = 'infinite';
        continue;
      }
      if (DIRECTIONS.has(ident as AnimationDirection)) {
        out.direction = ident as AnimationDirection;
        continue;
      }
      if (FILL_MODES.has(ident as AnimationFillMode)) {
        out.fillMode = ident as AnimationFillMode;
        continue;
      }
      const easing = easingFromIdent(ident);
      if (easing) {
        out.timingFunction = easing;
        continue;
      }
      if (!identSeen && ident !== 'none') {
        // First bare ident (not a keyword) is the animation name.
        out.name = ident;
        identSeen = true;
      }
      continue;
    }
    if (token.type === 'function') {
      const easing = lowerEasing(token);
      if (!easing) return null;
      out.timingFunction = easing;
      continue;
    }
    if (token.type === 'var') {
      // Unsubstituted var — caller is expected to substitute first.
      return null;
    }
    return null;
  }
  return out;
}

/** True when a typed animation shorthand is an explicit `animation: none`. */
export function isTypedAnimationNone(entry: AnyRecord): boolean {
  return (entry.name as AnyRecord | undefined)?.type === 'none';
}

/**
 * Typed lightningcss animation shorthand entry → shorthand fields.
 * Shape: { name: { type: 'ident' }, duration: { type: 'seconds' }, ... }.
 * P0 scope: single animation (first entry), matching lowerTimingFunction.
 */
export function typedAnimationShorthand(entry: AnyRecord): AnimationShorthand {
  const out: AnimationShorthand = {};
  const name = entry.name as AnyRecord | undefined;
  if (name?.type === 'ident') {
    const ident = scalarValue(name as CssToken);
    if (typeof ident === 'string' && ident !== 'none') out.name = ident;
  }
  if (entry.duration) {
    const ms = timeMsFromTokens([entry.duration as CssToken]);
    if (ms !== null) out.durationMs = ms;
  }
  if (entry.delay) {
    const ms = timeMsFromTokens([entry.delay as CssToken]);
    if (ms !== null && ms > 0) out.delayMs = ms;
  }
  if (entry.timingFunction) {
    const easing = lowerEasing(entry.timingFunction as AnyRecord);
    if (easing) out.timingFunction = easing;
  }
  const count = entry.iterationCount as AnyRecord | undefined;
  if (count?.type === 'infinite') {
    out.iterationCount = 'infinite';
  } else if (count && (count.type === 'number' || count.type === 'integer')) {
    const num = Number(count.value);
    // Default iteration count (1) carries no meaning — omit it.
    if (!Number.isNaN(num) && num >= 0 && num !== 1) out.iterationCount = num;
  }
  // lightningcss fills shorthand defaults (direction: normal, fill-mode:
  // none); they carry no meaning for IR and are omitted.
  const direction = entry.direction;
  if (
    typeof direction === 'string' &&
    direction !== 'normal' &&
    DIRECTIONS.has(direction as AnimationDirection)
  ) {
    out.direction = direction as AnimationDirection;
  }
  const fillMode = entry.fillMode;
  if (
    typeof fillMode === 'string' &&
    fillMode !== 'none' &&
    FILL_MODES.has(fillMode as AnimationFillMode)
  ) {
    out.fillMode = fillMode as AnimationFillMode;
  }
  return out;
}

/** Assemble the AnimationIR, attaching keyframes by name. */
export function buildAnimationIR(
  shorthand: AnimationShorthand,
  frames: KeyframeIR[],
): AnimationIR {
  const animation: AnimationIR = { name: shorthand.name as string, keyframes: frames };
  if (shorthand.durationMs !== undefined) animation.duration = { ms: shorthand.durationMs };
  if (shorthand.delayMs !== undefined) animation.delay = { ms: shorthand.delayMs };
  if (shorthand.timingFunction) animation.timingFunction = shorthand.timingFunction;
  if (shorthand.iterationCount !== undefined) animation.iterationCount = shorthand.iterationCount;
  if (shorthand.direction) animation.direction = shorthand.direction;
  if (shorthand.fillMode) animation.fillMode = shorthand.fillMode;
  return animation;
}

/** Full pipeline: unparsed animation shorthand → AnimationIR, or null + WF1006. */
export function lowerAnimationShorthand(
  tokens: CssToken[],
  keyframes: Map<string, KeyframeIR[]>,
  diagnostics: Diagnostic[],
): AnimationIR | null {
  const shorthand = parseAnimationShorthand(tokens);
  if (!shorthand || !shorthand.name) {
    diagnostics.push({
      code: 'WF1006',
      message: `Cannot statically lower animation: "${printTokens(tokens)}"`,
    });
    return null;
  }
  const frames = keyframes.get(shorthand.name);
  if (!frames) {
    diagnostics.push({
      code: 'WF1006',
      message: `Animation "${shorthand.name}" references @keyframes not found in the stylesheet`,
    });
    return null;
  }
  return buildAnimationIR(shorthand, frames);
}
