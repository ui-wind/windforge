/**
 * Core Style IR document.
 *
 * StyleIR is the stable contract between style-language frontends (Tailwind,
 * custom CSS, extension frontends) and platform backends (React Native
 * native, React Native Web, future Flutter). It MUST NOT import or reference
 * platform types; this package has zero runtime dependencies by design.
 *
 * See docs/specs/STYLE_IR_SPEC.md.
 */
import type { AnimationIR } from './animation.js';
import type { ConditionIR } from './conditions.js';
import type { CanonicalProperty } from './properties.js';
import type { IRValue } from './values.js';

/**
 * A single canonical declaration: property + value + ordering metadata.
 *
 * `priority` follows CSS cascade-style precedence within a document (higher
 * wins). `sourceOrder` preserves author order for declarations of equal
 * priority.
 */
export type DeclarationIR = {
  property: CanonicalProperty;
  value: IRValue;
  priority?: number;
  sourceOrder?: number;
};

/**
 * A variant binding: a named grouping of declarations that apply together
 * when a condition holds. Variants are how frontends express things like
 * `dark:p-4` (one condition, many declarations) without repeating condition
 * references per declaration.
 */
export type VariantIR = {
  id: string;
  /** Ids of the conditions this variant requires (all must hold). */
  conditionIds: string[];
  declarations: DeclarationIR[];
};

/** A theme token definition: name, category, resolved value. */
export type TokenIR = {
  ref: string;
  category: string;
  value: IRValue;
};

/**
 * Optional provenance information. Debug-only by contract: canonical hashing
 * ignores source metadata unless debug-sensitive hashing is explicitly
 * requested.
 */
export type SourceMetadata = {
  source?: string;
  line?: number;
  column?: number;
  /** Candidate class names or selector text the frontend produced this from. */
  candidates?: string[];
};

export type StyleIR = {
  /** IR format version; backends declare which versions they accept. */
  version: number;
  declarations: DeclarationIR[];
  conditions?: ConditionIR[];
  variants?: VariantIR[];
  tokens?: TokenIR[];
  animations?: AnimationIR[];
  metadata?: SourceMetadata;
};

/** Minimal valid document. */
export function emptyIR(version: number): StyleIR {
  return { version, declarations: [] };
}
