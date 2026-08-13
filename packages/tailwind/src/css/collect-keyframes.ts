/**
 * @keyframes → KeyframeIR[] lowering.
 *
 * Each keyframe selector (`from`/`to`/percentage) becomes an offset in 0..1;
 * its declarations lower through the same pipeline as style rules, with
 * per-rule custom properties (keyframes carry no theme variables of their
 * own). A declaration that cannot be lowered emits WF1006 once per @keyframes
 * rule and is dropped, keeping the rest of the frame.
 */
import type { KeyframeIR } from '@windforge/ir';
import { lowerTimingFunction } from './animation.js';
import { flattenDeclaration, type CollectedDeclaration } from './collect.js';
import { lowerDeclaration, type LowerContext } from './lower.js';
import { substituteVars, type VariableMap } from './resolve.js';
import { transformFromTyped } from './transform.js';
import { printTokens, type CssToken } from './token-print.js';
import type { Diagnostic } from '../types.js';

type AnyRecord = Record<string, unknown>;

function frameOffset(selector: AnyRecord): number | null {
  if (selector.type === 'from') return 0;
  if (selector.type === 'to') return 1;
  if (selector.type === 'percentage' && typeof selector.value === 'number') {
    return Number(selector.value.toFixed(4));
  }
  return null;
}

/**
 * Lower @keyframes rule values (lightningcss AST) to KeyframeIR frames,
 * keyed by animation name. `themeVars` substitutes var() references the
 * keyframe body makes into the theme.
 */
export function collectKeyframes(
  rawKeyframes: AnyRecord[],
  themeVars: VariableMap,
  diagnostics: Diagnostic[],
): Map<string, KeyframeIR[]> {
  const out = new Map<string, KeyframeIR[]>();
  const warned = new Set<string>();

  for (const rule of rawKeyframes) {
    const name = ((rule.name as AnyRecord)?.value as string) ?? null;
    if (!name || !Array.isArray(rule.keyframes)) continue;

    const frames: KeyframeIR[] = [];
    const warnOnce = (label: string) => {
      if (warned.has(name)) return;
      warned.add(name);
      diagnostics.push({ code: 'WF1006', message: label });
    };

    for (const frame of rule.keyframes as AnyRecord[]) {
      const selectors = (frame.selectors as AnyRecord[]) ?? [];
      // Multi-selector frames (`0%, 100% { … }`) duplicate the block; take
      // the first representable selector.
      let offset: number | null = null;
      for (const selector of selectors) {
        offset = frameOffset(selector);
        if (offset !== null) break;
      }
      if (offset === null) continue;

      const localVars: VariableMap = new Map();
      const collected: CollectedDeclaration[] = [];
      for (const declaration of ((frame.declarations as AnyRecord | undefined)?.declarations ??
        []) as AnyRecord[]) {
        collected.push(...flattenDeclaration(declaration, localVars, true));
      }

      const mergedVars: VariableMap = new Map([...themeVars, ...localVars]);
      const declarations: KeyframeIR['declarations'] = [];
      const frameIR: KeyframeIR = { offset, declarations };
      // Scratch buffer: lowering diagnostics from the shared pipeline are
      // re-emitted as one WF1006 per @keyframes rule below.
      const scratch: Diagnostic[] = [];
      const ctx: LowerContext = { diagnostics: scratch, fontSizePx: null };

      for (const declaration of collected) {
        if (declaration.property.startsWith('--')) continue; // frame-local vars
        if (declaration.property === 'animation-timing-function') {
          const easing = lowerFrameEasing(declaration, mergedVars);
          if (easing) frameIR.easing = easing;
          else {
            warnOnce(
              `Easing in @keyframes ${name} cannot be lowered; segment uses the animation default`,
            );
          }
          continue;
        }
        if (
          declaration.property === 'transform' ||
          declaration.property === 'rotate' ||
          declaration.property === 'scale' ||
          declaration.property === 'translate'
        ) {
          if (!declaration.unparsed) {
            const value = transformFromTyped(declaration.property, declaration.value);
            if (value && value.operations.length > 0) {
              declarations.push({ property: 'transform', value });
              continue;
            }
            if (value) continue; // transform: none → no transform in this frame
          }
          warnOnce(`Transform "${printDeclaration(declaration)}" in @keyframes ${name} cannot be lowered; dropped`);
          continue;
        }
        const lowered = lowerDeclaration(declaration, mergedVars, ctx);
        const first = lowered[0];
        if (first) {
          declarations.push({ property: first.property, value: first.value });
        } else {
          warnOnce(
            `Declaration "${declaration.property}" in @keyframes ${name} cannot be lowered; dropped`,
          );
        }
      }
      frames.push(frameIR);
    }

    if (frames.length > 0) {
      frames.sort((a, b) => a.offset - b.offset);
      out.set(name, frames);
    }
  }
  return out;
}

function printDeclaration(declaration: CollectedDeclaration): string {
  if (declaration.unparsed) return printTokens(declaration.value as CssToken[]);
  return declaration.property;
}

function lowerFrameEasing(
  declaration: CollectedDeclaration,
  vars: VariableMap,
): ReturnType<typeof lowerTimingFunction> {
  if (!declaration.unparsed) return lowerTimingFunction(declaration.value);
  const substituted = substituteVars(declaration.value as CssToken[], vars);
  if (!substituted) return null;
  return lowerTimingFunction(substituted);
}
