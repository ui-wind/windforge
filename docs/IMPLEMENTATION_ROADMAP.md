# Windforge Implementation Roadmap

The phase order reflects the architectural anchor from 2026-08: **native delivery
is the primary path for dynamic style updates on native platforms**, not a
late-stage optimization. Build-time resolution (Phases 0–1) produces the style
map; the native layer's job is delivering updates into Fabric's commit
transaction without forcing React re-renders. JS baseline remains the default
runtime, the fallback, and the parity reference for the web backend.

## Phase 0 — Architecture foundation ✅

Goal: establish boundaries before optimization.

Implement:

- monorepo
- TypeScript packages
- Style AST
- Style IR
- deterministic hashing
- compiler fixtures
- basic CLI
- Metro integration skeleton
- Expo SDK 57 / RN 0.86 New Architecture example

Do NOT implement C++ yet.

Status: done (commit `2cd458d`).

## Phase 1 — Tailwind core ✅

Implement:

- className
- spacing
- sizing
- flex
- alignment
- positioning
- colors
- typography
- borders
- radius
- opacity
- shadows
- arbitrary values
- variants
- dark mode
- platform selectors
- responsive rules

Target:

```tsx
<View className="flex-1 items-center justify-center bg-zinc-950 p-4" />
```

should compile deterministically.

Status: end-to-end done (commit `805ec9e`) — build-time pipeline
(`tailwind → lightningcss → IR → artifact`) plus the `@windforge/react-native`
runtime (`registry`, condition evaluation, cached `resolveClassName`,
provider + styled components). Runtime parsing remains a fallback only.

## Phase 2 — Web backend

Implement React Native Web backend alongside the native baseline.

Requirements:

- same className API
- CSS lowering
- deterministic generated classes
- responsive CSS
- pseudo states
- CSS variables
- SSR-safe output

## Phase 3 — Native delivery foundation ✅ (iOS)

Goal: restructure the runtime around a `StyleBackend` interface and land the
first native delivery path — the piggyback commit mode proven by the Fabric
commit-hook spike (`spikes/fabric-commit-hook/`, verdict GO).

Implement:

- ✅ `StyleBackend` interface with `js-baseline` default and `fabric` opt-in
- ✅ JS↔native delivery protocol (`docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md`):
  `registerStyles`, `link`, `suspend`, `unlink`, `updateStyles`,
  `getDiagnostics`
- ✅ artifact sync: push the resolved `className → style` map to the native
  registry
- ✅ mount/unmount bindings (`link`/`unlink`) from styled components
- ✅ condition ownership: JS observes `Appearance`/`Dimensions`, diffs unique
  classNames, pushes a single update per change — no React re-render of the
  styled tree
- ✅ piggyback commit: merge pending styles into React commits via
  `UIManagerCommitHook::shadowTreeWillCommit`; condition-only updates
  (no React commit at all) push through the first-party
  `UIManager::updateShadowTree(tagToProps)` API
- ✅ build-time `dependencies` (className → condition ids) emitted in the
  artifact and used as a diff prefilter by the fabric backend
- ✅ promote the spike C++ core into `@windforge/native` (podspec, TurboModule
  registration via `setSurfacePresenter:` injection, iOS first)
- ⏭ Android UIManager acquisition — deferred

Do NOT implement direct native commits yet — that is Phase 4.

## Phase 4 — Native direct commit ✅

Goal: condition-only updates (dark mode toggle, rotation, breakpoint change)
commit without riding on any React commit at all.

Done:

- ✅ `ShadowTreeSynchronizer` — family-keyed native-initiated commit of
  style-only changes via the first-party `ShadowTree::commit(transaction,
  CommitOptions)` CAS API, replacing the tag-based
  `UIManager::updateShadowTree` push path (per-surface snapshot taken under
  the registry lock, committed outside the lock, applied generations
  reconciled afterwards — see
  `docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md` §2)
- ✅ kill criteria verified on the simulator stress screen
  (`apps/example/src/app/stress.tsx`, runbook in
  `docs/guides/NATIVE_SETUP_IOS.md`): one transaction per surface (torn
  frames), newest-generation-only convergence (fast toggle), CAS rebase
  against concurrent React commits, absent-family skip + shared_ptr
  families (unmount race); diagnostics counters confirm no leak and no
  unbounded growth. Measured: 4× 60-flip appearance loops on the stress
  screen (React commits at 10Hz + 400ms mount/unmount churn) plus a home-
  screen loop — `directCommits` equals the effective flip count (240/240),
  `bindings` bounded at 27 against 913 churn links, final appearance
  correct after every loop, no crash
- ✅ commit hook kept as persistence mechanism (re-merges into React
  commits); `nativeProps_DEPRECATED` evaluated and documented as a backlog
  option (`docs/reference/UNISTYLES_REFERENCE.md`), not adopted

No "zero re-render" statement is published without the measurement that
backs it (architecture §9/§20); the full benchmark harness remains separate
infrastructure (`docs/specs/PERFORMANCE_BENCHMARK_SPEC.md`).

## Phase 5 — Dynamic runtime ✅

Goal: resolve className at runtime for expressions build-time extraction
cannot reach, while keeping build-time resolution primary. Unknown tokens try
a controlled fallback parser before being skipped; diagnostics make both paths
observable.

Done:

- ✅ `cx`/`cn` — conditional class expression helper (clsx semantics: strings,
  numbers, booleans, arrays, record-of-conditions; whitespace-normalized).
- ✅ controlled runtime fallback parser `parseStaticUtility` in
  `@windforge/ir` — static spacing utilities (`p`/`m`/`gap`/`w`/`h`/`size`/
  `top`/`right`/`bottom`/`left`, negatives, decimals, fractions, `full`),
  emitting the exact same IR shape the build produces so artifact and fallback
  agree byte-for-byte.
- ✅ resolve chain: artifact lookup first → fallback parser → skip. The
  composed-string result is cached (flyweight identity: the same className +
  condition-state string returns the same object).
- ✅ runtime diagnostics — counters (`resolves`, `cacheHits`, `cacheMisses`,
  `fallbackParses`, `fallbackMisses`) and a deduplicated `unknownTokens` list
  via `getRuntimeDiagnostics()`; dev-gated warn-once codes WF2001 (unknown
  class) and WF2002 (first fallback use).
- ✅ third-party prop mapping — `styled()` HOC, `registerComponent`/
  `getComponentMapping` registry, `useWindforgeStyle()` hook, and default
  secondary-surface mappings (`contentContainerClassName`,
  `columnWrapperClassName`). Native delivery links only the primary
  `className → style` mapping; secondary surfaces subscribe and re-render.
- ✅ bench infra — `vitest bench` (`resolve.bench.ts`) plus a `bench` turbo
  task. Measured on Mac mini (Apple M4, 24 GB):

  | case | median |
  | --- | --- |
  | static warm (composed-cache hit) | ~4.1M ops/s |
  | static cold (cache cleared/iter) | ~1.05M ops/s |
  | fallback parse + lower | ~1.4M ops/s |
  | fallback cache hit | ~5.4M ops/s |

  The composed-string cache is the hot path for condition flips; cold resolve
  is unchanged in order of magnitude from the Phase 1 per-token baseline.

Scope notes:

- The fallback subset deliberately excludes `px`/`py`/`mx`/`my`/`inset` and
  arbitrary values. Two-value shorthands (`padding-inline`/`padding-block`/
  `margin-inline`) are not statically lowered at build time yet, so keeping
  them out of the fallback avoids the runtime being more capable than the
  build. A follow-up adds build-side lowering for these shorthands.
- Arbitrary values and non-static utilities are resolved only by the build
  path; the fallback declines them and they surface as WF2001 unknown tokens.

### Decisions

These are the Phase 5 decision records (Rule 13).

- **Fallback parser location (exception to Rule 2).** `parseStaticUtility` lives
  in `@windforge/ir`, a sanctioned exception to the rule against placing
  Tailwind parsing in the core IR (`docs/specs/COMPILER_PIPELINE_SPEC.md`
  §Dynamic extraction). It is a controlled subset, not a general Tailwind
  parser, and emits IR rather than native values.
- **Diagnostic code ranges.** WF0xxx = CLI, WF1xxx = Tailwind frontend,
  WF2xxx = runtime (this phase: WF2001 unknown class, WF2002 first fallback
  use).
- **Composed-string cache is a flyweight.** Identical className + state
  strings return the same object reference, enabling cheap equality checks
  downstream; the cache is keyed by registry version so re-registering an
  artifact invalidates entries.
- **Fabric links the primary mapping only.** The native protocol binds one
  className string per host node; a component with only the `className →
  style` pair links natively, while components with secondary style surfaces
  subscribe to conditions and re-render (correctness over zero-re-render).
- **Spacing unit is a hard-coded 4px multiplier.** The fallback honors the
  default `--spacing: 0.25rem` × 16px grid; a custom `--spacing` override is
  not respected by the fallback (the build path resolves theme overrides, and
  scanned literals always win).

Demo: `apps/example/src/app/explore.tsx` (Dynamic tab). Verification runbook:
`docs/guides/NATIVE_SETUP_IOS.md`.

## Phase 6 — Reanimated (P0) ✅

Goal: class-driven keyframes and transitions on the UI thread via Reanimated 4,
with the compiler independent of Reanimated and zero React renders per frame.
Scope agreed up front: P0 (animate-*, transition-*, transform, animated
primitives, shared-value mirror, frame/render benchmarks); entering/exiting/
layout classes are a separate P1 follow-up.

Done:

- ✅ `TransitionIR` in `@windforge/ir` (`properties: 'all' | canonical[]`,
  duration/delay/timingFunction) — descriptive only, no Reanimated types
  (Rule 2).
- ✅ Tailwind frontend: `@keyframes` collection (previously dropped silently),
  `transform` lowering (translate/scale/rotate ops — `rotate-45` now compiles),
  `transition-*` longhands → `TransitionIR` (per-field last-wins), `animation`
  shorthand/longhands → `AnimationIR` with `var(--animate-*)` theme
  substitution; unknown `@keyframes` name → WF1006, the class keeps its static
  declarations.
- ✅ Runtime accessor `resolveAnimationMeta(className)` — composed-string
  semantics like `resolveStyle`: `animation` replaces wholesale, `transition`
  merges per field (later token wins per field), flyweight-cached.
- ✅ New package `@windforge/reanimated`:
  - `compile.ts` — pure planner, no Reanimated import: `planKeyframes`
    (per-segment CSS offset math, alternate/reverse, infinite) and
    `planTransition` (covered + animatable diffs animate, the rest snap),
    node-testable.
  - `components.tsx` — `AnimatedView/Text/Image/Pressable` opt-in primitives;
    `style = [resolved, animatedStyle, userStyle]`; keyframes attach
    `withDelay(withRepeat(withSequence(withTiming(...))))` once per animation
    identity; transitions reuse mid-flight SharedValues so interrupts retime
    from the current value.
  - `conditions.ts` — `useAnimatedConditionState()`: SharedValue mirror of the
    condition store (subscribe + dispose), pattern prior art from unistyles
    `useAnimatedTheme` (MIT; pattern referenced, nothing copied).
- ✅ Lowering fixes uncovered while building the demo: layout keywords from
  lightningcss typed enums (`align-items`/`justify-content`/`display`/
  `position`/`flex-*`/`italic`/`text-align`, bare `start`/`end` →
  `flex-start`/`flex-end`) and logical box shorthands `px-*`/`py-*`/`mx-*`/
  `my-*` → `paddingHorizontal` and friends (two-value forms fall back to
  physical longhands).
- ✅ Example Animation screen (`apps/example/src/app/animation.tsx`):
  `animate-spin` (built-in), `animate-spin-slow` (custom `@theme` token),
  `transition-all duration-500 ease-in-out` ternary toggle, live FPS via
  `useFrameCallback`, per-toggle render counter, diagnostics row.

Measured on the iOS simulator (iPhone 17 Pro, dev client, Metro dev bundle),
Rule 11:

| measurement | result |
| --- | --- |
| FPS while two infinite keyframes + a 500ms transition run | 60 (useFrameCallback ~1s window) |
| React renders of the transition box | 1 per className toggle, 0 per frame (counter still at 1 while idle; +1 per toggle under a 2s auto-toggle loop) |
| runtime diagnostics during animation | stable (resolves/cacheHits flat between toggles; no growth per frame) |

Scope notes:

- entering/exiting/layout animation classes = P1 follow-up (parity matrix rows
  stay P1).
- No runtime parser for animation strings (Rule 9): animation/transition
  metadata comes only from the build path; `animate-[...]` arbitrary values
  surface as WF2001.
- Android not exercised this phase (iOS-only verification, same as Phases 4–5).

### Decisions

These are the Phase 6 decision records (Rule 13).

- **Animated components subscribe, they do not fabric-link.** The native
  delivery protocol's only coordination primitive is whole-node `suspend`;
  animated nodes need per-property ownership that does not exist yet.
  Animated primitives always `useConditionState(true)` and re-render on
  condition flips; per-property suspend/ownership is the follow-up
  (`docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md`).
- **Per-property SharedValues.** `sv.value.prop = withTiming(...)` does not
  animate (reanimated limitation), so each animating property gets its own
  SharedValue; transforms get one SharedValue per operation axis.
- **The SV collection rides a SharedValue snapshot — worklet-capture freeze.**
  Reanimated deep-freezes every plain object a worklet captures
  (software-mansion/react-native-reanimated#5430, intended behavior). The
  first className toggle adds a scalar key to the registry and threw
  `TypeError: cannot add a new property` while the registry was captured by
  `useAnimatedStyle`. Fix: the JS-thread registry stays a plain mutable object
  (effects only, never captured); the worklet reads a snapshot published
  through `useSharedValue`, re-published (fresh identity) on every key-set
  change. SharedValues are the one mutable channel the freeze does not touch.
  Regression-tested in `components.test.tsx` (the mock freezes every published
  snapshot on assignment).
- **`compile.ts` is pure.** The planner emits easing descriptors, not Reanimated
  objects — the compiler stays independent of Reanimated
  (`docs/specs/REANIMATED_INTEGRATION_SPEC.md`) and the math is node-testable.
- **WF1006 range.** WF1xxx = frontend: unresolvable `@keyframes` reference or
  non-lowerable keyframe declaration (the declaration is dropped, the rest of
  the class survives).
- **`useAnimatedConditionState` mirrors unistyles' `useAnimatedTheme` pattern**
  (SharedValue mirror synced by store subscription, disposed in effect
  cleanup) — prior art referenced from the MIT repo, no code copied.

Demo: `apps/example/src/app/animation.tsx` (Animation tab). Verification
runbook: `docs/guides/NATIVE_SETUP_IOS.md`.

## Phase 7 — Native metrics/theme transitions

Implement:

- safe area
- font scale
- pixel ratio
- platform metrics
- layout direction
- native theme transitions

Keep metrics in the backend/capability layer.

## Phase 8 — Extension SDK

Implement:

- defineUtility
- defineVariant
- defineTokens
- definePreset
- custom frontend interface
- custom backend interface

## Phase 9 — Hardening

Run:

- iOS matrix
- Android matrix
- Web matrix
- Expo development builds
- release builds
- compiler stress tests
- monorepo tests
- benchmark suite

## Phase 10 — Flutter research

Only now evaluate the Flutter backend.

The existing IR and frontend architecture should make this an additional backend rather than a compiler rewrite.
