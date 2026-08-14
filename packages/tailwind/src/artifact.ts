/**
 * Runtime artifact assembly.
 *
 * Turns collected CSS rules into the runtime artifact: a deterministic map of
 * class name → base declarations + condition-gated variants, plus the
 * condition table the runtime evaluates.
 */
import {
  DEFAULT_DECLARATION_PRIORITY,
  IMPORTANT_DECLARATION_PRIORITY,
  hashCanonical,
  type AnimationIR,
  type ConditionIR,
  type DeclarationIR,
  type KeyframeIR,
  type TransitionIR,
} from '@windforge/ir';
import { collectStylesheet } from './css/collect.js';
import { collectKeyframes } from './css/collect-keyframes.js';
import { lowerRuleDeclarations } from './css/lower.js';
import { conditionId, specToConditionIR, type Diagnostic } from './types.js';

/** Artifact format version (independent of IR version). Bumped to 2 in Phase 12
 * to carry optional per-theme variable tables (`themes`). The runtime accepts
 * both v1 and v2 artifacts for backward compatibility. */
export const ARTIFACT_VERSION = 2;

/** A group of declarations gated by conditions (all must hold). */
export type VariantEntry = {
  conditionIds: string[];
  declarations: DeclarationIR[];
};

export type ClassEntry = {
  base: DeclarationIR[];
  variants?: VariantEntry[];
  /** Animation metadata lowered from `animation-*` / `animate-*` utilities. */
  animation?: AnimationIR;
  /** Transition metadata lowered from `transition-*` utilities. */
  transition?: TransitionIR;
};

export type RuntimeArtifact = {
  version: number;
  irVersion: number;
  hash: string;
  styles: Record<string, ClassEntry>;
  conditions: ConditionIR[];
  /**
   * className → condition ids that can change its resolved style (union of
   * its variants' conditionIds; base-only classes map to []). Derived at
   * build time so the fabric backend can prefilter which classes to diff
   * when a condition flips.
   */
  dependencies: Record<string, string[]>;
  /**
   * Per-theme CSS variable tables (Phase 12). Keyed by theme name; values are
   * serialized token arrays matching the VariableMap shape collected from
   * `:root` and `.themeName` selectors. Absent on v1 artifacts or when no
   * themes are configured. The runtime resolves `variable` IR values against
   * this table, falling back through scoped overrides → global overrides →
   * the default (`light`) theme.
   */
  themes?: Record<string, Array<{ name: string; tokens: unknown[] }>>;
};

export type BuildResult = {
  artifact: RuntimeArtifact;
  diagnostics: Diagnostic[];
};

/** Merge declarations, later wins per property (CSS cascade within a rule).
 * An `!important` declaration is never overwritten by a later non-important
 * one for the same property (Phase 15). */
function mergeDeclarations(
  existing: DeclarationIR[],
  incoming: DeclarationIR[],
): DeclarationIR[] {
  const byProperty = new Map<string, DeclarationIR>();
  for (const declaration of existing) {
    byProperty.set(declaration.property, declaration);
  }
  for (const declaration of incoming) {
    const prior = byProperty.get(declaration.property);
    // A prior important declaration survives a later non-important one.
    if (
      prior &&
      (prior.priority ?? 0) >= IMPORTANT_DECLARATION_PRIORITY &&
      (declaration.priority ?? 0) < IMPORTANT_DECLARATION_PRIORITY
    ) {
      continue;
    }
    byProperty.set(declaration.property, declaration);
  }
  return [...byProperty.values()];
}

/** Merge transition metadata per field: the later rule wins per field. */
function mergeTransition(
  existing: TransitionIR | undefined,
  incoming: TransitionIR,
): TransitionIR {
  if (!existing) return incoming;
  const merged: TransitionIR = { properties: incoming.properties };
  const duration = incoming.duration ?? existing.duration;
  if (duration) merged.duration = duration;
  const delay = incoming.delay ?? existing.delay;
  if (delay) merged.delay = delay;
  const timingFunction = incoming.timingFunction ?? existing.timingFunction;
  if (timingFunction) merged.timingFunction = timingFunction;
  return merged;
}

function toDeclarationIRs(
  lowered: Array<{
    property: DeclarationIR['property'];
    value: DeclarationIR['value'];
    important?: boolean;
  }>,
): DeclarationIR[] {
  let order = 0;
  return lowered.map((declaration) => ({
    property: declaration.property,
    value: declaration.value,
    priority: declaration.important
      ? IMPORTANT_DECLARATION_PRIORITY
      : DEFAULT_DECLARATION_PRIORITY,
    sourceOrder: order++,
  }));
}

/**
 * Build the runtime artifact from Tailwind-generated CSS.
 *
 * @param css output of `compileTailwindCss`
 * @param irVersion the IR format version this build targets
 * @param themeNames registered extra theme names (Phase 12); when provided,
 *   rules matching `.themeName { ... }` are harvested into the artifact's
 *   `themes` field for runtime variable resolution.
 */
export function buildArtifact(
  css: string,
  irVersion: number,
  themeNames?: string[],
): BuildResult {
  const collected = collectStylesheet(css, themeNames ? { themeNames } : undefined);
  const diagnostics = [...collected.diagnostics];
  const keyframes = collectKeyframes(collected.keyframes, collected.variables, diagnostics);

  const conditionMap = new Map<string, ConditionIR>();
  const styles: Record<string, ClassEntry> = {};
  const dependencies: Record<string, string[]> = {};

  for (const [className, rules] of [...collected.classes.entries()].sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  )) {
    let base: DeclarationIR[] = [];
    let animation: AnimationIR | undefined;
    let transition: TransitionIR | undefined;
    const variantGroups = new Map<string, VariantEntry>();

    for (const rule of rules) {
      const lowered = lowerRuleDeclarations(
        rule.declarations,
        collected.variables,
        keyframes,
        diagnostics,
        rule.locals,
      );

      if (rule.conditions.length === 0) {
        if (lowered.declarations.length > 0) {
          base = mergeDeclarations(base, toDeclarationIRs(lowered.declarations));
        }
        // Animation metadata rides on base rules (utility classes are not
        // emitted inside @media): last rule wins for animation, per-field
        // merge for transition (composed-string semantics).
        if (lowered.animation) animation = lowered.animation;
        if (lowered.transition) transition = mergeTransition(transition, lowered.transition);
        continue;
      }

      if (lowered.declarations.length === 0) continue;

      const conditionIds = rule.conditions.map((spec) => conditionId(spec));
      for (const spec of rule.conditions) {
        const id = conditionId(spec);
        if (!conditionMap.has(id)) conditionMap.set(id, specToConditionIR(spec));
      }
      const key = conditionIds.join('|');
      const existing = variantGroups.get(key);
      if (existing) {
        existing.declarations = mergeDeclarations(
          existing.declarations,
          toDeclarationIRs(lowered.declarations),
        );
      } else {
        variantGroups.set(key, { conditionIds, declarations: toDeclarationIRs(lowered.declarations) });
      }
    }

    if (base.length === 0 && variantGroups.size === 0 && !animation && !transition) continue;
    const entry: ClassEntry = { base };
    if (variantGroups.size > 0) {
      entry.variants = [...variantGroups.values()];
    }
    if (animation) entry.animation = animation;
    if (transition) entry.transition = transition;
    styles[className] = entry;
    dependencies[className] = entry.variants
      ? [...new Set(entry.variants.flatMap((variant) => variant.conditionIds))].sort()
      : [];
  }

  const conditions = [...conditionMap.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  // Phase 12 — serialize per-theme variable tables (VariableMap →
  // `{ name, tokens }` arrays) for runtime `variable` resolution.
  // Base @theme values (from :root) are emitted under the "default" key so
  // useCSSVariable can resolve them when no theme-specific override exists.
  let themes: Record<string, Array<{ name: string; tokens: unknown[] }>> | undefined;
  const hasBaseVars = collected.variables && collected.variables.size > 0;
  const hasThemeVars = collected.themeVariables && collected.themeVariables.size > 0;
  if (hasBaseVars || hasThemeVars) {
    themes = {};
    if (hasBaseVars) {
      themes['default'] = [...collected.variables!.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, tokens]) => ({ name, tokens }));
    }
    if (hasThemeVars) {
      for (const [themeName, vars] of [...collected.themeVariables!.entries()].sort(
        ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
      )) {
        themes[themeName] = [...vars.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(
          ([name, tokens]) => ({ name, tokens }),
        );
      }
    }
  }

  const hash = hashCanonical({ styles, conditions, themes });
  return {
    artifact: {
      version: ARTIFACT_VERSION,
      irVersion,
      hash,
      styles,
      conditions,
      dependencies,
      ...(themes ? { themes } : {}),
    },
    diagnostics,
  };
}

/**
 * Render the artifact as an ES module for `windforge/generated`.
 * Import-free by design: the Metro resolver maps `windforge/generated` to
 * this module, and the runtime registry picks it up at import time.
 */
export function renderArtifactModule(artifact: RuntimeArtifact): string {
  const json = JSON.stringify(artifact);
  return [
    `// Generated by @windforge/tailwind — do not edit.`,
    `// hash: ${artifact.hash}`,
    `import { registerArtifact } from '@windforge/react-native';`,
    ``,
    `registerArtifact(${json});`,
    ``,
  ].join('\n');
}

/**
 * Render several artifacts into one module (one import, N `registerArtifact`
 * calls). The runtime registry pushes each registration, and resolution
 * prefers later registrations per class name — so array order is override
 * order (default frontend first, custom frontends after).
 */
export function renderArtifactsModule(artifacts: RuntimeArtifact[]): string {
  const lines = [
    `// Generated by @windforge/tailwind — do not edit.`,
    `// artifacts: ${artifacts.map((artifact) => artifact.hash).join(', ')}`,
    `import { registerArtifact } from '@windforge/react-native';`,
    ``,
  ];
  for (const artifact of artifacts) {
    lines.push(`registerArtifact(${JSON.stringify(artifact)});`);
  }
  lines.push('');
  return lines.join('\n');
}
