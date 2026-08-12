/**
 * Runtime artifact assembly.
 *
 * Turns collected CSS rules into the runtime artifact: a deterministic map of
 * class name → base declarations + condition-gated variants, plus the
 * condition table the runtime evaluates.
 */
import {
  hashCanonical,
  type ConditionIR,
  type DeclarationIR,
} from '@windforge/ir';
import { collectStylesheet, type CollectedRule } from './css/collect.js';
import { lowerDeclaration, type LowerContext } from './css/lower.js';
import type { VariableMap } from './css/resolve.js';
import { conditionId, specToConditionIR, type Diagnostic } from './types.js';

/** Artifact format version (independent of IR version). */
export const ARTIFACT_VERSION = 1;

/** A group of declarations gated by conditions (all must hold). */
export type VariantEntry = {
  conditionIds: string[];
  declarations: DeclarationIR[];
};

export type ClassEntry = {
  base: DeclarationIR[];
  variants?: VariantEntry[];
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
};

export type BuildResult = {
  artifact: RuntimeArtifact;
  diagnostics: Diagnostic[];
};

/** Merge declarations, later wins per property (CSS cascade within a rule). */
function mergeDeclarations(
  existing: DeclarationIR[],
  incoming: DeclarationIR[],
): DeclarationIR[] {
  const byProperty = new Map<string, DeclarationIR>();
  for (const declaration of existing) {
    byProperty.set(declaration.property, declaration);
  }
  for (const declaration of incoming) {
    byProperty.set(declaration.property, declaration);
  }
  return [...byProperty.values()];
}

function lowerRule(
  rule: CollectedRule,
  variables: VariableMap,
  diagnostics: Diagnostic[],
): DeclarationIR[] {
  const ctx: LowerContext = { diagnostics, fontSizePx: null };
  const out: DeclarationIR[] = [];
  let order = 0;
  for (const declaration of rule.declarations) {
    for (const lowered of lowerDeclaration(declaration, variables, ctx)) {
      out.push({
        property: lowered.property,
        value: lowered.value,
        priority: 10,
        sourceOrder: order++,
      });
    }
  }
  return out;
}

/**
 * Build the runtime artifact from Tailwind-generated CSS.
 *
 * @param css output of `compileTailwindCss`
 * @param irVersion the IR format version this build targets
 */
export function buildArtifact(css: string, irVersion: number): BuildResult {
  const collected = collectStylesheet(css);
  const diagnostics = [...collected.diagnostics];

  const conditionMap = new Map<string, ConditionIR>();
  const styles: Record<string, ClassEntry> = {};
  const dependencies: Record<string, string[]> = {};

  for (const [className, rules] of [...collected.classes.entries()].sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  )) {
    let base: DeclarationIR[] = [];
    const variantGroups = new Map<string, VariantEntry>();

    for (const rule of rules) {
      const declarations = lowerRule(rule, collected.variables, diagnostics);
      if (declarations.length === 0) continue;

      if (rule.conditions.length === 0) {
        base = mergeDeclarations(base, declarations);
        continue;
      }

      const conditionIds = rule.conditions.map((spec) => conditionId(spec));
      for (const spec of rule.conditions) {
        const id = conditionId(spec);
        if (!conditionMap.has(id)) conditionMap.set(id, specToConditionIR(spec));
      }
      const key = conditionIds.join('|');
      const existing = variantGroups.get(key);
      if (existing) {
        existing.declarations = mergeDeclarations(existing.declarations, declarations);
      } else {
        variantGroups.set(key, { conditionIds, declarations });
      }
    }

    if (base.length === 0 && variantGroups.size === 0) continue;
    const entry: ClassEntry = { base };
    if (variantGroups.size > 0) {
      entry.variants = [...variantGroups.values()];
    }
    styles[className] = entry;
    dependencies[className] = entry.variants
      ? [...new Set(entry.variants.flatMap((variant) => variant.conditionIds))].sort()
      : [];
  }

  const conditions = [...conditionMap.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  const hash = hashCanonical({ styles, conditions });
  return {
    artifact: {
      version: ARTIFACT_VERSION,
      irVersion,
      hash,
      styles,
      conditions,
      dependencies,
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
