/**
 * Custom frontend interface (docs/specs/EXTENSION_API_SPEC.md: "a frontend
 * converts a style language into Style AST/IR").
 *
 * The default frontend is the Tailwind pipeline (@windforge/tailwind);
 * additional frontends run after it and their artifacts register in order —
 * the runtime registry prefers later registrations per class name, so a
 * frontend can override Tailwind classes one at a time.
 *
 * `RuntimeArtifact` is imported from @windforge/tailwind (its canonical
 * home) rather than copied here; frontends that hand-write artifacts must
 * set `version`/`irVersion` to the supported values and always include
 * `dependencies`.
 */
import { IR_VERSION } from '@windforge/ir';
import { ARTIFACT_VERSION, type Diagnostic, type RuntimeArtifact } from '@windforge/tailwind';

/** Context passed to custom frontends (resolved absolute paths). */
export type WindforgeFrontendContext = {
  /** Entry stylesheet path. */
  entry: string;
  /** Source root scanned for class candidates. */
  base: string;
};

export type WindforgeFrontend = {
  /** Display name, used in diagnostics. */
  name: string;
  /** Produce artifacts to register after the default Tailwind artifact. */
  generate(context: WindforgeFrontendContext): RuntimeArtifact[];
};

/**
 * Build-time validation of a frontend-produced artifact. The runtime rejects
 * version mismatches with a thrown error at app import; fabric additionally
 * prefilters condition updates through `dependencies`, so an artifact with
 * variant-gated classes but no dependency map would silently miss updates.
 */
export function validateFrontendArtifact(
  frontendName: string,
  artifact: RuntimeArtifact,
): Diagnostic | null {
  if (artifact.version !== ARTIFACT_VERSION || artifact.irVersion !== IR_VERSION) {
    return {
      code: 'WF3010',
      message:
        `Frontend "${frontendName}" produced artifact version ${artifact.version}/IR ${artifact.irVersion} — ` +
        `this build supports ${ARTIFACT_VERSION}/${IR_VERSION}`,
    };
  }
  if (artifact.dependencies === undefined || artifact.dependencies === null) {
    return {
      code: 'WF3010',
      message:
        `Frontend "${frontendName}" produced an artifact without a dependencies map — ` +
        'condition-gated classes would miss native condition updates',
    };
  }
  return null;
}
