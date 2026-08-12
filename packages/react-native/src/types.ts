/**
 * Runtime artifact types.
 *
 * Mirrors the shape emitted by @windforge/tailwind (`RuntimeArtifact`). The
 * runtime package does NOT depend on the tailwind package: the artifact is
 * data, exchanged through the generated module. Version fields gate
 * compatibility.
 */
import type { ConditionIR, DeclarationIR } from '@windforge/ir';

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
   * className → condition ids that can change its resolved style. Optional:
   * older artifacts (pre-dependency builds) omit it, and the fabric backend
   * then diffs every known class as before.
   */
  dependencies?: Record<string, string[]>;
};

/** Artifact format versions this runtime accepts. */
export const SUPPORTED_ARTIFACT_VERSION = 1;
export const SUPPORTED_IR_VERSION = 1;

export function isCompatibleArtifact(artifact: unknown): artifact is RuntimeArtifact {
  if (!artifact || typeof artifact !== 'object') return false;
  const candidate = artifact as Partial<RuntimeArtifact>;
  return (
    candidate.version === SUPPORTED_ARTIFACT_VERSION &&
    candidate.irVersion === SUPPORTED_IR_VERSION &&
    typeof candidate.styles === 'object' &&
    candidate.styles !== null &&
    Array.isArray(candidate.conditions)
  );
}
