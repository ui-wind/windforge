/**
 * IR format version.
 *
 * The IR is a versioned contract: backend packages declare which IR
 * versions they accept. Breaking IR changes must bump this version and go
 * through migration notes + fixtures + backend compatibility review
 * (see docs/specs/STYLE_IR_SPEC.md, "Versioning").
 */
export const IR_VERSION = 1;
