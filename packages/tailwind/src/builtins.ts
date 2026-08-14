/**
 * Windforge built-in utilities (Phase 15 — Uniwind Pro parity).
 *
 * CSS injected into every Tailwind compilation so these utilities exist
 * without user setup. Tailwind only emits utilities the scanner found as
 * candidates, so the injection is free when the utilities are unused.
 *
 * Safe area logical-edge utilities (`ps-safe`, `pe-safe`, `ms-safe`,
 * `me-safe`, `start-safe`, `end-safe`): the base rule applies the LTR
 * physical inset; a nested `@media (layout-direction: rtl)` rule swaps to
 * the mirrored physical inset. The media query uses the Windforge
 * `layout-direction` convention (see css/media.ts), so the artifact lowers
 * it to a `layout-direction:rtl` condition that respects subtree
 * `<LayoutDirection>` overrides at runtime. On native the `env()` values
 * lower to `safe-area` IR values resolved against the platform insets; on
 * web the raw CSS is valid as-is (browsers ignore the unknown media feature
 * and keep the LTR value).
 */

export const WINDFORGE_BUILTIN_CSS = `
@utility ps-safe {
  padding-inline-start: env(safe-area-inset-left);
  @media (layout-direction: rtl) {
    padding-inline-start: env(safe-area-inset-right);
  }
}
@utility pe-safe {
  padding-inline-end: env(safe-area-inset-right);
  @media (layout-direction: rtl) {
    padding-inline-end: env(safe-area-inset-left);
  }
}
@utility ms-safe {
  margin-inline-start: env(safe-area-inset-left);
  @media (layout-direction: rtl) {
    margin-inline-start: env(safe-area-inset-right);
  }
}
@utility me-safe {
  margin-inline-end: env(safe-area-inset-right);
  @media (layout-direction: rtl) {
    margin-inline-end: env(safe-area-inset-left);
  }
}
@utility start-safe {
  inset-inline-start: env(safe-area-inset-left);
  @media (layout-direction: rtl) {
    inset-inline-start: env(safe-area-inset-right);
  }
}
@utility end-safe {
  inset-inline-end: env(safe-area-inset-right);
  @media (layout-direction: rtl) {
    inset-inline-end: env(safe-area-inset-left);
  }
}
`;
