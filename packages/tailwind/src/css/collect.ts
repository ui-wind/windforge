/**
 * Collect declarations from Tailwind-generated CSS.
 *
 * Runs lightningcss `transform` with a Rule visitor:
 * - `@media` rules are captured manually (returning `[]` removes them and
 *   suppresses automatic child visitation) so their declarations carry
 *   condition context;
 * - top-level style rules flow through the visitor normally;
 * - `:root` / `:host` custom properties become the build-time variable map;
 * - pseudo-class rules (hover:, focus:, …) produce diagnostics — interactive
 *   states need the Phase 2 backend.
 */
import { transform } from 'lightningcss';
import type { ConditionSpec, Diagnostic } from '../types.js';
import { isPointerCapabilityFailure, mediaDiagnostic, parseMediaQuery } from './media.js';
import type { VariableMap } from './resolve.js';
import { normalizeTokens, type CssToken } from './token-print.js';

type AnyRecord = Record<string, unknown>;

export type CollectedDeclaration = {
  property: string;
  value: unknown;
  unparsed: boolean;
  line?: number;
  column?: number;
};

export type CollectedRule = {
  conditions: ConditionSpec[];
  declarations: CollectedDeclaration[];
};

export type CollectedStylesheet = {
  variables: VariableMap;
  classes: Map<string, CollectedRule[]>;
  diagnostics: Diagnostic[];
};

type Selector = { type: string; name?: string; kind?: string };

/** Pseudo selectors carry their identifier in `kind`, named ones in `name`. */
function selectorName(selector: Selector): string | undefined {
  const name = selector.name ?? selector.kind;
  return typeof name === 'string' ? name : undefined;
}

export function collectStylesheet(css: string): CollectedStylesheet {
  const variables: VariableMap = new Map();
  const classes = new Map<string, CollectedRule[]>();
  const diagnostics: Diagnostic[] = [];
  const seenPseudoDiagnostics = new Set<string>();
  let pointerCapabilityDiagnosticEmitted = false;

  function collectDeclarations(
    rule: AnyRecord,
    intoCustomProps: boolean,
  ): CollectedDeclaration[] {
    const declarationsBlock = rule.declarations as
      | { importantDeclarations: AnyRecord[]; declarations: AnyRecord[] }
      | undefined;
    const all = [
      ...(declarationsBlock?.declarations ?? []),
      // Important flags carry no extra semantics for RN lowering.
      ...(declarationsBlock?.importantDeclarations ?? []),
    ];
    const out: CollectedDeclaration[] = [];
    for (const declaration of all) {
      const property = declaration.property as string;

      // Unparsed values (var()/calc() etc.): the real property id lives in
      // `value.propertyId` and the value is a raw token list.
      if (property === 'unparsed') {
        const unparsed = declaration.value as AnyRecord;
        const propertyId = unparsed.propertyId as AnyRecord | undefined;
        const tokens = unparsed.value as CssToken[] | undefined;
        const loc = declaration.loc as AnyRecord | undefined;
        if (typeof propertyId?.property === 'string' && Array.isArray(tokens)) {
          const collected: CollectedDeclaration = {
            property: propertyId.property,
            value: normalizeTokens(tokens),
            unparsed: true,
          };
          if (loc && typeof loc.line === 'number') collected.line = loc.line;
          if (loc && typeof loc.column === 'number') collected.column = loc.column;
          out.push(collected);
        }
        continue;
      }

      if (property === 'custom') {
        if (intoCustomProps) {
          const value = declaration.value as AnyRecord;
          const tokens = value.value as CssToken[] | undefined;
          if (typeof value.name === 'string' && Array.isArray(tokens)) {
            variables.set(value.name, normalizeTokens(tokens));
          }
        }
        continue;
      }
      const loc = declaration.loc as AnyRecord | undefined;
      const collected: CollectedDeclaration = {
        property,
        value: declaration.value,
        unparsed: false,
      };
      if (loc && typeof loc.line === 'number') collected.line = loc.line;
      if (loc && typeof loc.column === 'number') collected.column = loc.column;
      out.push(collected);
    }
    return out;
  }

  function handleStyleRule(rule: AnyRecord, conditions: ConditionSpec[]): void {
    const selectorGroups = rule.selectors as Selector[][] | undefined;
    if (!selectorGroups) return;
    const declarations = collectDeclarations(rule, false);

    for (const group of selectorGroups) {
      if (group.length === 0) continue;

      // `:root` / `:host` theme blocks: harvest custom properties.
      const first = group[0] as Selector | undefined;
      if (
        group.length === 1 &&
        first?.type === 'pseudo-class' &&
        (selectorName(first) === 'root' || selectorName(first) === 'host')
      ) {
        collectDeclarations(rule, true);
        continue;
      }

      // Base-layer content (tag/universal selectors): skip silently.
      if (!group.some((s) => s.type === 'class')) continue;
      if (declarations.length === 0) continue;

      const pseudo = group.find(
        (s) => s.type === 'pseudo-class' || s.type === 'pseudo-element',
      );
      if (pseudo) {
        const key = selectorName(pseudo) ?? pseudo.type;
        if (!seenPseudoDiagnostics.has(key)) {
          seenPseudoDiagnostics.add(key);
          diagnostics.push({
            code: 'WF1004',
            message: `:${key} state variants require the interactive backend (Phase 2); rule skipped`,
          });
        }
        continue;
      }

      // MVP: single-class selectors only (`.p-4`, `.dark\:bg-zinc-900`).
      if (group.length === 1 && first?.type === 'class' && selectorName(first)) {
        const className = selectorName(first) as string;
        const existing = classes.get(className);
        const ruleEntry: CollectedRule = { conditions, declarations };
        if (existing) existing.push(ruleEntry);
        else classes.set(className, [ruleEntry]);
      }
      // Compound / descendant selectors are skipped (interactive phase).
    }
  }

  function walkNestedRules(rules: AnyRecord[], conditions: ConditionSpec[]): void {
    for (const nested of rules ?? []) {
      // Nested rules come as { type, value } envelopes.
      const value = nested.value as AnyRecord | undefined;
      if (!value) continue;
      if (nested.type === 'media') {
        const parsed = parseMediaQuery(value.query as AnyRecord);
        if (!parsed.ok) {
          if (!isPointerCapabilityFailure(parsed)) {
            diagnostics.push(mediaDiagnostic(parsed));
          }
          continue;
        }
        walkNestedRules(value.rules as AnyRecord[], [...conditions, ...parsed.conditions]);
        continue;
      }
      if (nested.type === 'style') {
        handleStyleRule(value, conditions);
      }
    }
  }

  transform({
    filename: 'windforge.css',
    code: Buffer.from(css),
    visitor: {
      Rule(rule) {
        const anyRule = rule as unknown as AnyRecord;
        const value = anyRule.value as AnyRecord | undefined;
        if (!value) return undefined;

        if (anyRule.type === 'media') {
          const parsed = parseMediaQuery(value.query as AnyRecord);
          if (!parsed.ok) {
            if (isPointerCapabilityFailure(parsed)) {
              // hover: candidates each get their own @media block; report once.
              if (!pointerCapabilityDiagnosticEmitted) {
                pointerCapabilityDiagnosticEmitted = true;
                diagnostics.push(mediaDiagnostic(parsed));
              }
            } else {
              diagnostics.push(mediaDiagnostic(parsed));
            }
            // Remove the rule; returning [] also suppresses child visitation.
            return [];
          }
          walkNestedRules(value.rules as AnyRecord[], parsed.conditions);
          return [];
        }
        if (anyRule.type === 'style') {
          handleStyleRule(value, []);
        }
        return undefined;
      },
    },
  });

  return { variables, classes, diagnostics };
}
