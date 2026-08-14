/**
 * Collect declarations from Tailwind-generated CSS.
 *
 * Runs lightningcss `transform` with a Rule visitor:
 * - `@media` rules are captured manually (returning `[]` removes them and
 *   suppresses automatic child visitation) so their declarations carry
 *   condition context;
 * - top-level style rules flow through the visitor normally;
 * - `:root` / `:host` custom properties become the build-time variable map;
 * - pseudo-class / attribute selectors (hover:, focus:, group-hover:,
 *   data-[…]:, …) lower to `state` / `data` conditions evaluated against
 *   component state at runtime (Phase 11). Selector shapes the runtime
 *   cannot express produce a WF1004 diagnostic and are skipped.
 */
import { transform } from 'lightningcss';
import type { InteractionState } from '@windforge/ir';
import type { ConditionSpec, Diagnostic } from '../types.js';
import { mediaDiagnostic, parseMediaQuery } from './media.js';
import type { VariableMap } from './resolve.js';
import { normalizeTokens, scalarValue, type CssToken } from './token-print.js';

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
  /** Custom properties declared inside this rule (e.g. `--tw-scale-x`);
   * they shadow theme vars when substituting this rule's declarations. */
  locals?: VariableMap;
};

export type CollectedStylesheet = {
  variables: VariableMap;
  classes: Map<string, CollectedRule[]>;
  /** Raw top-level @keyframes rule values; lowered to KeyframeIR by the
   * artifact builder (collect-keyframes). */
  keyframes: AnyRecord[];
  diagnostics: Diagnostic[];
  /**
   * Per-theme variable tables (Phase 12). Keyed by theme name; populated from
   * rules whose selector is a single class matching a registered theme name
   * (e.g. `.sunset { --color-accent: #ef4444; }`). Absent when no themes are
   * configured.
   */
  themeVariables?: Map<string, VariableMap>;
};

type Selector = { type: string; name?: string; kind?: string };

/** Pseudo selectors carry their identifier in `kind`, named ones in `name`. */
function selectorName(selector: Selector): string | undefined {
  const name = selector.name ?? selector.kind;
  return typeof name === 'string' ? name : undefined;
}

/** Pseudo-classes the runtime can express as component state (Phase 11).
 * `focus-visible` collapses to `focus` — React Native has one focus state. */
const INTERACTIVE_PSEUDO_STATES: Record<string, InteractionState> = {
  hover: 'hover',
  focus: 'focus',
  'focus-visible': 'focus',
  active: 'active',
  disabled: 'disabled',
};

/**
 * Lower one compound-selector group (`.hover\:bg-x:hover`,
 * `.group-hover\:bg-x:is(:where(.group):hover *)`,
 * `.data-\[open\]\:bg-x[data-open]`, …) into its class name plus the
 * interaction conditions the extra selector tokens express.
 *
 * Returns null for shapes the runtime cannot express; `recordUnsupported`
 * fires the deduplicated WF1004 diagnostic.
 */
function lowerSelectorGroup(
  group: Selector[],
  recordUnsupported: (key: string) => void,
): { className: string; conditions: ConditionSpec[] } | null {
  const classTokens = group.filter((s) => s.type === 'class');
  const className = classTokens.length === 1 ? selectorName(classTokens[0] as Selector) : undefined;
  if (!className) {
    recordUnsupported(classTokens.length > 1 ? 'compound class selector' : 'class-less selector');
    return null;
  }

  const conditions: ConditionSpec[] = [];
  for (const token of group) {
    if (token.type === 'class') continue;

    if (token.type === 'pseudo-class') {
      const kind = token.kind as string | undefined;
      const state = kind ? INTERACTIVE_PSEUDO_STATES[kind] : undefined;
      if (state) {
        conditions.push({ kind: 'state', state });
        continue;
      }
      const groupSpec = kind === 'is' || kind === 'where'
        ? matchGroupSelector(token as unknown as AnyRecord)
        : null;
      if (groupSpec) {
        conditions.push(groupSpec);
        continue;
      }
      // Phase 12 — named-theme variant: `:where(.themeName, .themeName *)`
      // appended to the utility class by `@custom-variant name (...)`.
      const themeSpec = kind === 'where'
        ? matchThemeSelector(token as unknown as AnyRecord)
        : null;
      if (themeSpec) {
        conditions.push(themeSpec);
        continue;
      }
      recordUnsupported(`:${kind ?? 'unknown'}`);
      return null;
    }

    if (token.type === 'pseudo-element') {
      recordUnsupported(`::${selectorName(token) ?? 'unknown'}`);
      return null;
    }

    if (token.type === 'attribute') {
      const dataSpec = matchDataAttribute(token as unknown as AnyRecord);
      if (dataSpec) {
        conditions.push(dataSpec);
        continue;
      }
      recordUnsupported(`attribute ${(token as unknown as AnyRecord).name as string}`);
      return null;
    }

    recordUnsupported(token.type);
    return null;
  }

  return { className, conditions };
}

/**
 * Match Tailwind's group-selector shape inside `:is(...)`:
 * `:is(:where(.group[/name]):state *)`. Returns the group state condition,
 * or null when the shape is not a supported group selector.
 */
function matchGroupSelector(token: AnyRecord): ConditionSpec | null {
  const lists = token.selectors as Selector[][] | undefined;
  if (!Array.isArray(lists) || lists.length !== 1) return null;
  const list = lists[0] as Selector[] | undefined;
  if (!Array.isArray(list) || list.length !== 4) return null;
  const [whereToken, stateToken, combinator, universal] = list as AnyRecord[];

  if (whereToken?.type !== 'pseudo-class' || whereToken.kind !== 'where') return null;
  const whereLists = whereToken.selectors as Selector[][] | undefined;
  if (!Array.isArray(whereLists) || whereLists.length !== 1) return null;
  const inner = whereLists[0] as Selector[] | undefined;
  if (!Array.isArray(inner) || inner.length !== 1) return null;
  const classToken = inner[0] as Selector | undefined;
  if (classToken?.type !== 'class' || typeof classToken.name !== 'string') return null;
  let groupName: string;
  if (classToken.name === 'group') groupName = '';
  else if (classToken.name.startsWith('group/')) groupName = classToken.name.slice('group/'.length);
  else return null;

  if (stateToken?.type !== 'pseudo-class') return null;
  const state = INTERACTIVE_PSEUDO_STATES[stateToken.kind as string];
  if (!state) return null;
  if (combinator?.type !== 'combinator' || universal?.type !== 'universal') return null;

  const spec: ConditionSpec = { kind: 'state', state, group: true };
  if (groupName) (spec as { groupName?: string }).groupName = groupName;
  return spec;
}

/**
 * Match a `data-*` attribute selector: `[data-selected="true"]` (exact
 * match) or `[data-open]` (presence). Other attribute operators (~=, ^=, …)
 * and non-data attributes are not expressible in the runtime.
 */
function matchDataAttribute(token: AnyRecord): ConditionSpec | null {
  const name = token.name;
  if (typeof name !== 'string' || !name.startsWith('data-')) return null;
  const operation = token.operation as
    | { operator?: string; value?: unknown }
    | null
    | undefined;
  if (operation === null || operation === undefined) {
    return { kind: 'data', name: name.slice('data-'.length) };
  }
  if (operation.operator === 'equal' && typeof operation.value === 'string') {
    return { kind: 'data', name: name.slice('data-'.length), value: operation.value };
  }
  return null;
}

/**
 * Match Tailwind's named-theme variant selector inside `:where(...)`:
 * `:where(.themeName, .themeName *)`. The compiler injects these via
 * `@custom-variant <name> (&:where(.<name>, .<name> *))` for each entry in
 * `extraThemes`. Returns a `theme` condition spec, or null when the shape
 * does not match.
 *
 * Lightningcss parses `:where(.sunset, .sunset *)` as a `where` pseudo-class
 * with two selector lists: `[class(sunset)]` and
 * `[class(sunset), combinator(descendant), universal]`.
 */
function matchThemeSelector(token: AnyRecord): ConditionSpec | null {
  const lists = token.selectors as Selector[][] | undefined;
  if (!Array.isArray(lists) || lists.length !== 2) return null;

  const first = lists[0] as Selector[] | undefined;
  const second = lists[1] as Selector[] | undefined;
  if (!Array.isArray(first) || first.length !== 1) return null;
  if (!Array.isArray(second) || second.length !== 3) return null;

  const classToken = first[0] as Selector | undefined;
  if (classToken?.type !== 'class' || typeof classToken.name !== 'string') return null;

  const descendantClass = second[0] as Selector | undefined;
  const combinator = second[1] as Selector | undefined;
  const descendantUniversal = second[2] as Selector | undefined;
  if (descendantClass?.type !== 'class' || descendantClass.name !== classToken.name) return null;
  if (combinator?.type !== 'combinator') return null;
  if (descendantUniversal?.type !== 'universal') return null;

  // Reject built-in names that collide with color-scheme conditions.
  if (classToken.name === 'light' || classToken.name === 'dark') return null;

  return { kind: 'theme', name: classToken.name };
}

/**
 * Flatten one lightningcss declaration record into collected declarations.
 * Shared by style-rule collection and @keyframes bodies (collect-keyframes).
 * `custom` records are harvested into `variables` when `intoCustomProps`.
 */
export function flattenDeclaration(
  declaration: AnyRecord,
  variables: VariableMap,
  intoCustomProps: boolean,
): CollectedDeclaration[] {
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
      return [collected];
    }
    return [];
  }

  if (property === 'custom') {
    if (intoCustomProps) {
      const value = declaration.value as AnyRecord;
      const tokens = value.value as CssToken[] | undefined;
      if (typeof value.name === 'string' && Array.isArray(tokens)) {
        const normalized = normalizeTokens(tokens);
        // CSS-wide keyword values (e.g. the @property fallback shim's
        // `--tw-duration: initial`) can never resolve a var() reference.
        const significant = normalized.filter((t) => t.type !== 'white-space');
        const only = significant[0];
        if (significant.length === 1 && only?.type === 'ident' && scalarValue(only) === 'initial') {
          return [];
        }
        variables.set(value.name, normalized);
      }
    }
    return [];
  }

  const loc = declaration.loc as AnyRecord | undefined;
  const collected: CollectedDeclaration = {
    property,
    value: declaration.value,
    unparsed: false,
  };
  if (loc && typeof loc.line === 'number') collected.line = loc.line;
  if (loc && typeof loc.column === 'number') collected.column = loc.column;
  return [collected];
}

export type CollectOptions = {
  /** Registered theme names (Phase 12). When provided, rules whose selector is
   * a single class matching one of these names are harvested into
   * `themeVariables` instead of the regular `classes` map. */
  themeNames?: string[];
};

export function collectStylesheet(css: string, options?: CollectOptions): CollectedStylesheet {
  const variables: VariableMap = new Map();
  const classes = new Map<string, CollectedRule[]>();
  const keyframes: AnyRecord[] = [];
  const diagnostics: Diagnostic[] = [];
  const seenSelectorDiagnostics = new Set<string>();
  const themeNames = new Set(options?.themeNames ?? []);
  const themeVariables: Map<string, VariableMap> = new Map();

  /** Deduplicated WF1004 for selector shapes the runtime cannot express. */
  function recordUnsupportedSelector(key: string): void {
    if (seenSelectorDiagnostics.has(key)) return;
    seenSelectorDiagnostics.add(key);
    diagnostics.push({
      code: 'WF1004',
      message: `Unsupported selector (${key}); rule skipped`,
    });
  }

  function collectDeclarations(rule: AnyRecord, target: VariableMap): CollectedDeclaration[] {
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
      out.push(...flattenDeclaration(declaration, target, true));
    }
    return out;
  }

  function handleStyleRule(rule: AnyRecord, conditions: ConditionSpec[]): void {
    const selectorGroups = rule.selectors as Selector[][] | undefined;
    if (!selectorGroups) return;
    // Custom properties declared with a class selector scope to that rule
    // (Tailwind's `--tw-scale-x`); on class-less rules (`:root`, universal
    // base-layer defaults) they are global defaults.
    const hasClass = selectorGroups.some((group) =>
      group.some((s) => s.type === 'class'),
    );
    const locals: VariableMap = new Map();
    const declarations = collectDeclarations(rule, hasClass ? locals : variables);

    for (const group of selectorGroups) {
      if (group.length === 0) continue;

      // Custom properties on class-less rules (`:root`/universal) were already
      // harvested into the global map; non-class rules carry no style data.
      if (!group.some((s) => s.type === 'class')) continue;

      // Phase 12 — single-class selectors matching a registered theme name
      // (`.sunset { --color-accent: #ef4444; }`) carry per-theme variable
      // definitions. Harvest them into themeVariables instead of classes.
      // This check runs BEFORE the declarations-empty guard because these
      // rules contain ONLY custom properties (no regular declarations).
      if (group.length === 1 && conditions.length === 0) {
        const only = group[0] as Selector | undefined;
        if (only?.type === 'class' && typeof only.name === 'string' && themeNames.has(only.name)) {
          let tv = themeVariables.get(only.name);
          if (!tv) {
            tv = new Map();
            themeVariables.set(only.name, tv);
          }
          // Re-collect custom properties into this theme's map.
          collectDeclarations(rule, tv);
          continue;
        }
      }

      if (declarations.length === 0) continue;

      // Single-class selectors (`.p-4`, `.dark\:bg-zinc-900`) carry no extra
      // conditions; compound selectors lower their pseudo/attribute/group
      // tokens into interaction conditions (Phase 11).
      const lowered = lowerSelectorGroup(group, recordUnsupportedSelector);
      if (!lowered) continue;

      const existing = classes.get(lowered.className);
      const ruleEntry: CollectedRule = {
        conditions: [...conditions, ...lowered.conditions],
        declarations,
      };
      if (locals.size > 0) ruleEntry.locals = locals;
      if (existing) existing.push(ruleEntry);
      else classes.set(lowered.className, [ruleEntry]);
    }
  }

  function walkNestedRules(rules: AnyRecord[], conditions: ConditionSpec[]): void {
    for (const nested of rules ?? []) {
      // Nested rules come as { type, value } envelopes.
      const value = nested.value as AnyRecord | undefined;
      if (!value) continue;
      if (nested.type === 'media') {
        const parsed = parseMediaQuery(value.query as AnyRecord, {
          transparentPointerCaps: true,
        });
        if (!parsed.ok) {
          diagnostics.push(mediaDiagnostic(parsed));
          continue;
        }
        walkNestedRules(value.rules as AnyRecord[], [...conditions, ...parsed.conditions]);
        continue;
      }
      if (nested.type === 'style') {
        handleStyleRule(value, conditions);
      }
      if (nested.type === 'keyframes') {
        keyframes.push(value);
      }
      // @supports/@property shims carry no style data (see visitor note).
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
          // Tailwind wraps hover:/group-hover: utilities in
          // `@media (hover: hover)`; that capability gate is transparent
          // here — the interaction state arrives via component state.
          const parsed = parseMediaQuery(value.query as AnyRecord, {
            transparentPointerCaps: true,
          });
          if (!parsed.ok) {
            diagnostics.push(mediaDiagnostic(parsed));
            // Remove the rule; returning [] also suppresses child visitation.
            return [];
          }
          walkNestedRules(value.rules as AnyRecord[], parsed.conditions);
          return [];
        }
        // @property rules carry no style data for lowering.
        if (anyRule.type === 'property') return [];
        if (anyRule.type === 'style') {
          handleStyleRule(value, []);
        }
        if (anyRule.type === 'keyframes') {
          keyframes.push(value);
        }
        return undefined;
      },
    },
  });

  const result: CollectedStylesheet = { variables, classes, keyframes, diagnostics };
  if (themeVariables.size > 0) result.themeVariables = themeVariables;
  return result;
}
