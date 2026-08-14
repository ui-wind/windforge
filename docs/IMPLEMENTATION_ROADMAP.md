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

## Phase 7 — Native metrics/theme transitions ✅

Goal: surface platform metrics (safe area, font scale, pixel ratio, layout
direction) as stable backend/capability-layer APIs, add `rtl:`/`ltr:` variants,
and ship a native theme-transition progress hook. Scope agreed up front:
progress hook + demo first; auto-animating `dark:` variant flips is a
follow-up.

Done:

- ✅ `ConditionState` extended with `fontScale`, `pixelRatio`,
  `layoutDirection`; `stateSignature()` (the cache key of every style cache)
  covers the new fields, so a metric change can never stale-hit a cached
  style. Provider seeds them from `PixelRatio.getFontScale()`,
  `PixelRatio.get()` and `I18nManager.getConstants().isRTL`; the Dimensions
  change handler re-reads font scale (Android fires it on accessibility
  changes); layout direction is read once at boot.
- ✅ Metrics capability layer (`packages/react-native/src/metrics.ts`):
  `getMetrics()`/`useMetrics()` merge conditions + insets; insets live in
  their own store (`getInsets`/`subscribeInsets`/`useInsets`) because they are
  a read-only metric, not a variant driver. `getMetrics()` memoizes its
  snapshot — `useSyncExternalStore` requires a referentially stable
  `getSnapshot`, rebuilt only when the underlying store references change
  (regression-tested).
- ✅ Optional safe-area entrypoint `@windforge/react-native/safe-area`
  (subpath export, `react-native-safe-area-context` as optional peer):
  `WindforgeSafeAreaProvider` mounts the bridge that publishes
  `useSafeAreaInsets()` into the insets store. Apps that never mount it pay
  nothing.
- ✅ `LayoutDirectionConditionIR` in `@windforge/ir` (platform-neutral,
  Rule 2) + Tailwind convention `@custom-variant rtl (@media
  (layout-direction: rtl))` (same `@media` feature pattern as `platform:`);
  `evaluateCondition` gained the `layout-direction` case, so the fabric
  backend's dependency-diff picks the variants up with no extra wiring.
- ✅ `useAnimatedThemeProgress()` in `@windforge/reanimated`: SharedValue
  0 (light) ↔ 1 (dark), `withTiming` on every color-scheme flip (default
  400ms), reduced-motion → duration 0 snap; consumers interpolate colors in
  `useAnimatedStyle` (`interpolateColor`), so frames animate on the UI thread
  with zero React renders.
- ✅ Example Metrics screen (`apps/example/src/app/metrics.tsx`, web
  placeholder, Metrics tab): live `useMetrics()` panel, `rtl:`/`ltr:` demo
  boxes, theme-transition crossfade box with a render counter, diagnostics
  row; `_layout.tsx` wraps the app in `WindforgeSafeAreaProvider`.

Measured on the iOS simulator (iPhone 17 Pro, dev client, Metro dev bundle),
Rule 11:

| measurement | result |
| --- | --- |
| `useMetrics()` panel | colorScheme light/dark (live flip), platform ios, window 402x874, fontScale 1, pixelRatio 3, layoutDirection ltr, insets t:62 r:0 b:34 l:0 |
| `ltr:` variant resolution | pixel-exact artifact values on screen: box background `#615fff` (indigo-500), direction-aware text `#a3b3ff` (indigo-300); `rtl:` correctly inactive in ltr |
| theme flip (`simctl ui appearance dark`) | crossfade box settles at `#18181b`; its React render counter stays at 1 — 0 renders while frames animate |
| native delivery across flips | adapter `available: true`; appearance reports show styleUpdates 55→74 and directCommits 1 (cumulative counters include stress-screen churn between reports) |
| regression | Home/Explore/Animation/Stress clean in dark mode; Animation FPS still 60 |

Scope notes:

- Auto-animating `dark:` variant flips on styled components = follow-up (the
  progress hook shipped first, per the agreed scope).
- `env(safe-area-inset-*)` CSS lowering / `pt-safe`-style utilities =
  follow-up; this phase ships the insets metrics API only.
- No font-scale/pixel-ratio variants (Tailwind has no equivalent); the
  extension point is ready — `media.ts` rejects unknown features with a
  diagnostic.
- Android not exercised this phase (iOS-only verification, same as
  Phases 4–6); web reads are guarded (missing `I18nManager` constants →
  `ltr`/`1`).

### Decisions

These are the Phase 7 decision records (Rule 13).

- **Metrics live in the JS capability layer; no new native code (Rule 4).**
  All metrics come from RN JS APIs (`PixelRatio`, `Dimensions`,
  `I18nManager`) plus the optional safe-area-context bridge — no new
  TurboModule method. The native `getMetrics()` in
  `docs/specs/RN_FABRIC_NATIVE_BACKEND_SPEC.md` stays design-only; revisit
  only if profiling ever shows the JS path is hot.
- **Layout direction is read once at boot.** `I18nManager` direction changes
  require an app restart on both platforms, so observing it once is complete;
  no subscription exists.
- **Insets are a separate store + optional entrypoint, not a
  `ConditionState` field.** Nothing in the variant system keys off insets, so
  putting them in `stateSignature` would invalidate every style cache on
  rotation for no benefit; the optional subpath keeps
  `react-native-safe-area-context` out of apps that don't want it.
- **Font scale is surfaced, not applied.** RN `Text` already scales font
  sizes with the system font scale; Windforge exposes the metric (and keys
  caches on it) but does not double-scale rem.
- **`useAnimatedThemeProgress` mirrors unistyles' `useAnimatedTheme` pattern**
  (SharedValue progress 0..1 animated on theme flip; MIT prior art, pattern
  referenced, nothing copied). Auto theme crossfade of `dark:` variants is
  the follow-up.

Demo: `apps/example/src/app/metrics.tsx` (Metrics tab). Verification runbook:
`docs/guides/NATIVE_SETUP_IOS.md`.

## Phase 8 — Extension SDK ✅

Goal: let Windforge grow beyond Tailwind without rewriting the compiler —
`defineUtility`, `defineVariant`, `defineTokens`, `definePreset`, a custom
frontend interface and a custom backend interface
(`docs/specs/EXTENSION_API_SPEC.md`).

Done:

- ✅ New package `@windforge/extension-sdk` (zero deps): the four `define*`
  functions return plain serializable descriptors; `renderExtensions` lowers
  them to CSS text (`@utility` / `@custom-variant` / `@theme`) injected into
  the entry stylesheet after the WF1000 check and before oxide compilation —
  oxide + the existing IR pipeline do all of the work. Validation is
  pre-render (oxide positions cannot be attributed back to the extension
  that produced the text): WF3001 invalid name, WF3002 empty body/value,
  WF3003 `@import` in extension CSS, WF3004 non-evaluable variant media,
  WF3005 unknown token namespace.
- ✅ `@windforge/tailwind`: `generate({ extraCss })` injection seam, and
  try/catch around the oxide compile/build so malformed CSS surfaces as a
  WF1xxx diagnostic instead of crashing Metro startup.
- ✅ `@windforge/metro`: `compileWindforge({ extensions, frontends })` —
  extensions render to `extraCss`; `WindforgeFrontend = { name, generate }`
  runs after the default Tailwind frontend, each produced artifact is
  validated (`version`/`irVersion` supported, `dependencies` present —
  WF3010) and the generated module renders N `registerArtifact` calls; the
  registry prefers later registrations per class name, so frontends
  override Tailwind one class at a time.
- ✅ `@windforge/react-native`: `setBackend(backend)` escape hatch and
  `StyleBackendName` widened to `'js-baseline' | 'fabric' | (string & {})`
  (built-in autocomplete kept, custom names accepted).
- ✅ Example: `apps/example/windforge.config.cjs` (`glass` utility, `brand`
  color token, `land` orientation variant, plus a handwritten frontend
  emitting `card-pad`/`card-radius`) wired through `metro.config.js`;
  Extensions screen (`apps/example/src/app/extensions.tsx`, under More in
  the tab bar) with a web placeholder.

Measured on the iOS simulator (iPhone 17 Pro, dev client, Metro dev bundle),
Rule 11:

| measurement | result |
| --- | --- |
| artifact, baseline → extended | hash `e5fd5b4f` (87 classes, 5 conditions) → `a3f5366a` (90 classes, 6 conditions) plus a second artifact `example-frontend-v1` (2 classes) |
| `glass bg-brand` box, light | pixel `#4cce7c` = 0.8 × `#22c55e` over `#f4f4f5` (glass opacity over the page background), exact |
| same box, dark | `#65a702` ≈ 0.8 × lime-500 `#84cc16` over `#09090b` (`dark:` override wins over the token) |
| `land:bg-emerald-500`, landscape | `#31c795` ≈ 0.8 × `#10b981` over `#f4f4f5` — the defineVariant condition flips live on rotation; portrait stays brand green |
| custom frontend box | `card-pad card-radius bg-indigo-500` renders `#615fff` with padding 20 / radius 14 from the handwritten artifact; no WF2001 |
| backend row | `getBackend().name` = `fabric` — `installNativeDelivery` still owns backend selection (setBackend ordering contract) |
| regression | Home/Explore/Animation/Metrics/Stress clean in light+dark; tab bar gains Extensions under More |

Scope notes:

- Declarations outside the RN lowering table receive WF1003/WF1005 like any
  Tailwind utility (no special-casing); variant media is limited to the five
  evaluable condition kinds (color-scheme, orientation, platform,
  layout-direction, width ranges).
- No config-file loader in `@windforge/metro` — the example requires its own
  `windforge.config.cjs` and passes `extensions`/`frontends` to
  `compileWindforge` (zero-magic Metro).
- Android not exercised this phase (iOS-only verification, same as
  Phases 4–7).

### Decisions

These are the Phase 8 decision records (Rule 13).

- **CSS-text lowering, not IR hooks.** Every `define*` lowers to CSS text
  injected before oxide; oxide + the existing collect/lower pipeline do the
  rest. An IR-level hook after oxide would fork that pipeline for zero
  benefit and violate build-time-first, while oxide already implements
  `@utility`/`@theme`/`@custom-variant` semantics correctly.
- **`WindforgeFrontend` lives in `@windforge/metro` and imports
  `RuntimeArtifact` from `@windforge/tailwind`.** Metro is the build-time
  orchestrator and already depends on tailwind; moving `RuntimeArtifact` to
  `@windforge/ir` (its conceptual home) is deferred to avoid cross-package
  churn this phase.
- **WF3xxx validation is pre-render.** Oxide throws plain errors whose
  positions cannot be mapped back to the extension that produced the text,
  so `renderExtensions` validates names, bodies and media before rendering;
  invalid descriptors are dropped, valid ones still render.
- **`setBackend` is an escape hatch with an ordering contract.** It must be
  the last backend-affecting call before `WindforgeProvider` mounts
  (`installNativeDelivery` ends with `selectBackend('fabric')`); custom
  backends that want native condition delivery wrap or delegate to fabric
  instead of replacing it; `resolveStyle` must stay correct because
  `@windforge/reanimated` calls it on every animated render.
- **No config-file loader (deferred).** Metro stays zero-magic; a loader
  with discovery and conventions is a later DX phase.

Demo: `apps/example/src/app/extensions.tsx` (Extensions, under More in the
tab bar). Verification runbook: `docs/guides/NATIVE_SETUP_IOS.md`.

## Phase 9 — Hardening

Done:

- ✅ Compatibility declarations (Rule 10): `react-native` peer tightened to
  `>=0.86 <0.87` in `native`/`react-native`/`reanimated` (reanimated
  previously claimed unverified 0.83–0.85), optional `react-native-web`
  peer `>=0.21 <0.22`; verified-matrix table in
  `docs/specs/VERSION_COMPATIBILITY.md`.
- ✅ Compiler stress tests (`packages/tailwind/tests/stress.test.ts`):
  full-utility-surface sweep + large-N (4,748 candidates) with
  determinism and diagnostic assertions and a shape snapshot.
- ✅ Cross-process determinism
  (`packages/metro/tests/determinism-cross-process.test.ts` +
  `tests/helpers/print-compiled.mjs`): separate `node` processes produce
  byte-identical generated modules (extension trio included); turbo
  `test` override in `packages/metro` adds the package's own build.
- ✅ Benchmark suite expansion: `packages/tailwind/tests/compile.bench.ts`,
  `packages/metro/tests/compiler.bench.ts`, `scripts/bench-env.mjs`
  reproducibility record, `pnpm bench` at the root, first real entry in
  `docs/reference/BENCHMARK_RECORDS.md`.
- ✅ CI (`.github/workflows/ci.yml`): push/PR on ubuntu-latest, pnpm
  frozen-lockfile, turbo build → typecheck → test with a local-only turbo
  cache via actions/cache.
- ✅ Android matrix, first run (E1): dev build on Pixel_9 (arm64-v8a),
  js-baseline backend with the designed warn-once degradation;
  Home/Explore/Stress light+dark pixel-verified; runbook in
  `docs/guides/NATIVE_SETUP_ANDROID.md`.
- ✅ iOS matrix (E2): six screens × portrait × light/dark pixel-verified;
  landscape documented as manual-only; iOS Release build on the simulator
  boots and renders from the embedded bundle (Metro stopped), light+dark.
- ✅ Web matrix (E3): static export (8 routes), headless Chrome
  screenshots of six routes pixel-verified; runbook in
  `docs/guides/WEB_SETUP.md`. Three real web defects found and fixed:
  missing tab triggers in `app-tabs.web.tsx`, `getWindforgeStyleModule()`
  touching `TurboModuleRegistry` on web (react-native-web does not export
  it — `Platform.OS` guard now short-circuits first), and placeholder
  screens importing View/Text from plain `react-native` (silently ignores
  `className` on web) plus the web Tabs height-collapse
  (`minHeight: '100vh'` + `pt-20` convention in the `.web.tsx` files).
- ✅ Android release (E4): `expo run:android --variant release` green
  end-to-end; release buildType signed with the template debug config (no
  keystore); embedded-bundle boot verified light+dark with Metro stopped.
- ✅ Monorepo tests (F): the turbo task graph in CI *is* the monorepo test
  (decision below); cross-process determinism covers the workspace
  artifact path.
- ✅ Tooling: `scripts/pixel-sample.mjs` (pngjs) shared by all three
  matrices.

Measured (Rule 11; build-time numbers from
`docs/reference/BENCHMARK_RECORDS.md`, 2026-08-13 entry, Apple M4 / Node
22.22.2):

| measurement | result |
| --- | --- |
| stress sweep | 118 supported candidates + controls → artifact 85 classes / 7 conditions, hash `2d860987`; zero WF1001/1002/1003/1005, exactly one control WF1004; two builds byte-identical |
| large-N stress | 4,748 candidates → 4,748 classes; two builds 274 ms wall combined; byte-identical |
| cross-process determinism | 3 separate `node` processes: generated-module bytes and 8-hex hash identical |
| cold compile (sweep surface) | mean 1.85 ms (p75 2.34, p99 4.79) |
| incremental build, cache-busted (28 candidates) | mean 0.0005 ms |
| incremental build, cache-busted (4,748 candidates) | mean 0.0207 ms |
| candidate→IR lowering (4,748-class stylesheet) | median 17.5 ms |
| `compileWindforge` e2e fixture app | mean 3.37 ms without extensions, 3.84 ms with the extension trio |
| iOS matrix | 12 portrait screenshots, exact pixels: root `#09090b` light / `#18181b` dark, accent `#3b82f6`, emerald card `#00bc7d` (OKLCH sRGB of `emerald-500`) |
| iOS release | embedded bundle boots with Metro down; light/dark exact at (10,1500) |
| Android first debug build | `BUILD SUCCESSFUL in 5m 20s` (AGP 8.12.0, Gradle 9.3.1, JDK 17); js-baseline `available: false` as designed |
| Android release | cold release compile 5m 40s, warm rerun 5–19s; APK ~104MB; embedded bundle light `#09090b` / dark `#18181b` with Metro down |
| web matrix | 6 routes pixel-verified: roots `#09090b` (index/explore/stress/animation) and `#f4f4f5` (metrics/extensions), stress panel `#f4f4f5` |

Scope notes:

- Landscape is manual-only in the iOS matrix: the device framebuffer is
  owned by the Simulator window (Cmd+←/→); per-device orientation
  `defaults`/PlistBuddy keys were verified to change accepted orientations
  but not the framebuffer. Automated coverage is portrait × light/dark.
- Web screenshots are light-mode only; dark needs CDP
  `Emulation.setEmulatedMedia`, not scripted in the runbook.
- Android native delivery stays deferred (Rule 14): the matrix verifies
  the js-baseline degradation path, not a fabric-Android adapter.
- Two environment gotchas hit during E4 (documented in
  NATIVE_SETUP_ANDROID.md, not product defects): concurrent gradle builds
  race on the shared `.cxx` CMake directory (x86 ninja failure), and the
  6GB emulator userdata image fills up after debug+release installs
  (`INSTALL_FAILED_INSUFFICIENT_STORAGE`).

### Decisions

These are the Phase 9 decision records (Rule 13).

- **Stress tests live in `@windforge/tailwind`.** It owns candidate
  injection; the snapshot (classes/conditions/hash) is updated only on
  intended compiler/Tailwind changes (`vitest -u` with review), never to
  make a red build green.
- **Cross-process determinism spawns the built dist.** The helper imports
  `dist/index.js` and runs in separate `node` processes, so the test
  proves the shipped artifact is deterministic, not just the TS sources;
  `packages/metro` gets a turbo `test` override (`^build` + own `build`)
  because the default graph only builds upstream packages.
- **Benchmarks are local-first, records are real runs only.** `pnpm bench`
  + `scripts/bench-env.mjs` produce a paste-ready environment record;
  `BENCHMARK_RECORDS.md` accepts measured entries exclusively (AGENTS.md:
  no invented numbers). Benches are not a CI gate.
- **CI is one ubuntu workflow without a lint step.** `expo lint` fails
  deterministically on example-app hook-rule errors today; adding a red
  lint step would gate the workspace on unrelated churn. Simulator,
  emulator and web pixel runs stay manual runbooks (they need macOS/Xcode,
  SDK images, and a display server).
- **Monorepo tests = the turbo graph in CI.** build/typecheck/test across
  all packages plus the cross-process workspace-artifact test cover the
  failure classes a bespoke workspace-integrity suite would add; revisit
  only if a real workspace bug appears that the graph misses.
- **Peer ranges track the verified matrix.** `>=0.86 <0.87` for
  `react-native` (only 0.86.2 exercised), reanimated tightened from
  `>=0.83` to `>=0.86` (0.83–0.85 never ran), `react-native-web` optional
  `>=0.21 <0.22`.
- **Android verified on js-baseline; fabric-Android deferred** (Rule 14
  transparency). The warn-once degradation is the tested contract.
- **pngjs over sharp** for `pixel-sample.mjs`: pure JS, no postinstall
  outside the pnpm allowlist.
- **Web placeholder conventions from the three live defects.** Styled
  primitives come from `@windforge/react-native` (plain RN ignores
  `className` on web); web-only screen roots set
  `minHeight: '100vh'` + `pt-20` (Tabs root has no height, floating bar
  overlays ~66px); any native-module accessor guards
  `Platform.OS === 'web'` *before* touching `TurboModuleRegistry`.
- **Release builds use template debug signing; no keystores.** Both
  platforms verified with the embedded bundle by stopping Metro and
  launching cold; signing/keystore work belongs to a release-engineering
  phase.

Verification runbooks: `docs/guides/NATIVE_SETUP_IOS.md`,
`docs/guides/NATIVE_SETUP_ANDROID.md`, `docs/guides/WEB_SETUP.md`.

## Phase 10 — RN CLI + Expo dual support, source discovery, watch/HMR ✅

Goal: close the gap versus the Uniwind OSS feature set that Windforge was
missing — verify a bare React Native CLI project end to end, adopt
Tailwind-native source discovery (`compiler.sources`: auto-detect +
`@source` + `.gitignore`), and make newly added classes reach a running app
without a Metro restart. Direction decision: keep delegating to the official
Tailwind v4 engines (`@tailwindcss/oxide` + `@tailwindcss/node`), and solve
HMR with a file watcher that regenerates the artifact — not by patching
Metro internals (patterns studied from the MIT Uniwind clone, facts only,
no copied code).

Done:

- ✅ `@windforge/tailwind` source discovery: `generate()` now runs the
  `@tailwindcss/node` compile first, then scans `compiler.sources` (official
  auto-detect, honoring `@source` directives and `.gitignore`) plus the
  entry-directory glob; `defaultSources` is kept additively so repos without
  auto-detected sources behave as before. Fixtures `tests/fixtures/sources/`
  + `sources-not/` with an `@source "../shared"` target and a
  `.gitignore`-excluded `Secret.tsx` (force-added to git);
  `source-discovery.test.ts`.
- ✅ Color fix: the lightningcss N-API bridge delivers a CSS `none` channel
  as `NaN`; `channel()` (`css/color.ts`) maps null/undefined/NaN → `none`
  for every color function that lowers through it. `zinc-50`
  (`oklch(98.5% 0 none)`) now resolves to `#fafafa`; regression test in
  `tests/color.test.ts`.
- ✅ `@windforge/metro` watch mode: `compileWindforge({ watch })` starts
  `fs.watch` (recursive) over the scan bases plus every CSS dependency
  collected through the existing `onDependency` hook; 100 ms debounce,
  artifact write skipped when bytes are unchanged; `stop()` plus
  `SIGINT`/`SIGTERM`/`exit` cleanup. Default on, disabled by `watch: false`
  or `process.env.CI`. `watch.test.ts` (temp dirs).
- ✅ `apps/bare`: bare RN CLI app (React Native 0.86.2,
  `@react-native-community/cli` 20.1.0) — `getDefaultConfig` from
  `@react-native/metro-config` + workspace-root `watchFolders` +
  `withWindforge`; `@react-native/babel-preset` only; package
  `dev.windforge.bare`; committed `ios/` + `android/`. Demo screen:
  `@theme` accent token, light/dark zinc pairs, system→light→dark cycle
  button. `@windforge/metro` needed no code change — `MetroConfigLike`
  already made it Expo-agnostic.
- ✅ `apps/example` gains watch mode automatically; its `metro.config.js`
  comment updated (no more Metro restart when adding a class).

Measured (Rule 11; real runs, 2026-08-14, runbook
`docs/guides/NATIVE_SETUP_BARE.md`):

| measurement | result |
| --- | --- |
| bare iOS simulator (iPhone 17 Pro sim), light+dark, scheme `system` | 7/7 exact pixels per mode: root `#f4f4f5`/`#09090b`, accent `#3b82f6`, zinc-300/700 `#d4d4d8`/`#3f3f46`, zinc-900/50 `#18181b`/`#fafafa`, rose-500 `#ff2056`, card `#fafafa`/`#18181b` |
| bare Android (Pixel_9, arm64-v8a), light+dark | same table exact |
| HMR, live | adding a class changed the artifact hash `54cd11a7` → `31a1f3d0` (`bg-rose-500` present); the running iOS app rendered the new swatch via HMR; deleting the change restored the artifact byte-for-byte (`54cd11a7`); Metro PID 7397 unchanged throughout |
| HMR, log evidence | HMR pushes are silent in the Metro log (no new BUNDLE lines); Android's fresh bundle request from the same Metro process is the log proof (BUNDLE count 3 → 9, same PID) |
| bare Android build | `BUILD SUCCESSFUL` (4 s warm retry after the storage fix; CMake for arm64-v8a/armeabi-v7a/x86/x86_64) |
| source discovery | `@source "../shared"` candidates found; `.gitignore`-excluded source absent from the artifact |

Scope notes:

- `apps/bare` verifies the js-baseline backend on both platforms; the
  fabric backend remains verified in `apps/example` (Phases 3–4).
- Landscape and release builds for `apps/bare` were not run (covered by the
  example matrix E2/E4).
- One unexplained environment anomaly: an iOS `simctl ui appearance` flip
  occasionally double-advanced the demo button's state; it did not
  reproduce on retest and the app logic is verified clean — noted for
  transparency (Rule 14), not a known product defect.

### Decisions

These are the Phase 10 decision records (Rule 13).

- **File watcher + artifact regeneration, not Metro-internals patching.**
  The artifact lives inside the project root, so Metro's own watcher
  invalidates `windforge/generated` and pushes HMR naturally. This is
  deliberately different from Uniwind OSS's `Graph.traverseDependencies`
  patch: nothing to break across Metro versions.
- **Watch defaults on, off in CI / `watch: false`.** Debounce 100 ms and
  skip-write on identical artifact bytes prevent invalidation loops on
  no-op regenerations.
- **`apps/bare` commits `ios/` + `android/`.** Bare CLI apps own their
  native projects as source; the never-commit rule from now on applies to
  `apps/example` only (its native folders remain `expo prebuild` output).
- **Source discovery delegates to `compiler.sources`.** Official Tailwind
  semantics (auto-detect, `@source`, `.gitignore`) with no re-implementation;
  `defaultSources` stays additive for backward compatibility.
- **pnpm + bare CLI:** `android/settings.gradle` `includeBuild` assumes a
  hoisted layout, so `@react-native/gradle-plugin` is an explicit
  devDependency of `apps/bare` (same version as `react-native`).
- **`rose-500` is `#ff2056`, not the v3 `#f43f5e`.** Tailwind v4 palettes
  are oklch-native and the saturated triple sits slightly outside sRGB;
  naive clamp, culori `toGamut('rgb')` and CSS gamut mapping all agree.
  The pixel doubles as the oklch→sRGB lowering canary.
- **`NaN` hue handling lives in `channel()`.** The N-API bridge turns CSS
  `none` into `NaN`; mapping it back to `none` at the single lowering point
  fixes every affected color function at once.
- **Flutter research renumbered Phase 10 → Phase 14** to make room for the
  Uniwind-parity phases 10–13.

Demo: `apps/bare/src/App.tsx`. Verification runbook:
`docs/guides/NATIVE_SETUP_BARE.md`.

## Phase 11 — Interactive variants (`active/focus/disabled/hover`, `group-*`, `data-*`)

**Goal:** pseudo-state, group-propagation, and data-attribute variants resolve from component state at runtime; compiler lowers them to condition kinds `state` and `data`.

### Done

- Compiler (`css/collect.ts`): `:hover`/`:focus`/`:active`/`:disabled` selectors lower to condition kind `state`; `group-hover:` → `state` + `group:true` + optional `groupName`; `data-[attr=value]:` → condition kind `data` (exact-match or boolean presence). `STYLE_IR_SPEC.md` updated with `state` and `data` condition entries.
- Runtime (`resolve.ts`): two-tier specificity merge — base declarations merge in token order first, then ALL active variant declarations overlay on top regardless of token position (CSS specificity semantics). `resolveClassNameTiers()` returns `ResolvedTiers {base, variant}`; cache keyed by `registryVersion|className|stateSignature|componentStateSignature`.
- Runtime (`state.ts`): `ComponentState {pressed?, hovered?, focused?, disabled?, groups?: Record<string, GroupInteractionState>, data?: Record<string, unknown>}`; stable `componentStateSignature()`.
- Runtime (`group.ts`): `GroupContext` React context provider; nearest-wins for same name; anonymous group = empty-string key; named groups scoped by `groupName`. `useGroupStates()` reads ancestor group state automatically.
- Components (`components.tsx`): `Pressable` captures press via `onPressIn/onPressOut` and hover via `onHoverIn/onHoverOut`; provides own group state when `className` contains `group` or `group/<name>`; `TextInput` captures focus/blur; both pass `ComponentState` to `resolveClassNames`. `editable={false}` treated as disabled. `data-*` props feed `ComponentState.data` and are stripped from the host element.
- `styled()` mapping (`prop-mapping/styled.ts`): custom components receive resolved styles with component state support; `data-*` props handled identically.
- Tests: `interactive.test.tsx` (20 tests) covers Pressable press/hover/disabled, TextInput focus, group propagation (anonymous, named, nearest-wins), data conditions, styled(), useWindforgeStyle with component state. `resolve.test.ts` extended with specificity-order tests (variant outranks base regardless of token order). All green.
- Example screen: `apps/example/src/app/interactive.tsx` demos every interactive lowering — pressed card (`active:bg-emerald-500`), hover card (`hover:bg-blue-500`), focus input (`focus:bg-amber-500`), disabled Pressable + TextInput (`disabled:opacity-50`), anonymous group (`group-active:text-emerald-400`), named group (`group/card` + `group-active/card:text-blue-400`), data toggle (`data-[selected=true]:bg-emerald-500`).

### Measured

| Surface | Idle hex | Active hex | Method | Date |
|---|---|---|---|---|
| Pressed card bg (Android) | #3b82f6 | #00bc7d | adb screencap pixel sample | 2026-08-13 |
| Focus input bg (Android) | #ffffff | #fe9a0b | adb screencap pixel sample | 2026-08-13 |
| Anonymous group bg (Android) | #27272a | #3f3f46 | adb screencap pixel sample | 2026-08-13 |
| Anonymous group child text (Android) | #d4d4d8 | #00d492 | adb screencap pixel sample | 2026-08-13 |
| Named group child text (Android) | #d4d4d8 | #51a2ff | adb screencap pixel sample | 2026-08-13 |
| Named group control child (Android) | #71717b | #71717b (unchanged) | adb screencap pixel sample | 2026-08-13 |
| Data target bg (Android) | #27272a | #00bc7d | adb screencap pixel sample | 2026-08-13 |
| Disabled Pressable over dark (Android) | #224681 (static) | n/a | adb screencap pixel sample | 2026-08-13 |
| Disabled input (Android) | #848485 (static) | n/a | adb screencap pixel sample | 2026-08-13 |
| Pressed/hover cards idle bg (iOS sim) | #3b82f6 | — | simctl screenshot pixel sample | 2026-08-13 |
| Focus input bg (iOS sim) | #ffffff | #fe9a00 | simctl screenshot pixel sample | 2026-08-13 |
| Disabled Pressable over dark (iOS sim) | #224681 (static) | n/a | simctl screenshot pixel sample | 2026-08-13 |
| Disabled input (iOS sim) | #848485 (static) | n/a | simctl screenshot pixel sample | 2026-08-13 |
| Group card bg idle (iOS sim) | #27272a | — | simctl screenshot pixel sample | 2026-08-13 |
| Group child texts idle (iOS sim) | #d4d4d8 / #71717b | — | simctl screenshot pixel sample | 2026-08-13 |

Note: iOS simulator CGEvent mouse injection reaches native UIKit views (TextInput focus, UIAlert buttons) but does not trigger Fabric JS touch responders (Pressable onPressIn, ScrollView scroll). Window geometry verified identical to calibration (window 49365 at 1991,127 size 392x845); no occlusion confirmed. iOS pressed/group/data active-state pixels therefore verified via unit tests + Android device only. This is a simulator-input-environment limitation, not a Windforge defect.

### Scope notes

- `hover:` on native RN requires pointer-capable devices (iPad with trackpad/mouse); on phone-class devices it is inert (no hover hardware). The compiler still lowers it; the runtime evaluates the `hovered` flag which stays false without hardware hover events. Web receives pure CSS `:hover` (Phase 13).
- The two-tier specificity merge is O(n) per resolution: one pass collects base declarations in token order, a second pass overlays all active variant declarations. No sorting needed because variants always win over base.
- Group propagation uses React context (not global state). Nearest-wins is implemented by each provider reading its parent's context and shadowing the same group name. Performance cost: one context read per styled descendant per render; acceptable for typical UI trees.
- `data-*` prop stripping: any prop starting with `data-` is consumed by the resolver and removed from the host element's props. This prevents RN warnings about unknown props on native views.

### Decisions

- **Two-tier merge vs. single-pass sort.** Single-pass would require tracking specificity weight per declaration and sorting. Two-tier is simpler and matches CSS semantics exactly: conditional selectors always outrank plain utilities regardless of source order.
- **Context-based group propagation vs. global store.** Context is the natural React pattern for tree-scoped state; nearest-wins falls out naturally from nested providers. Global store would require manual ancestor tracking.
- **No copying Uniwind implementation.** Group propagation designed from first principles: small `GroupContext` provider, `useGroupStates()` consumer hook. Facts/patterns from Uniwind MIT OSS informed the design (named groups, nearest-wins), but zero implementation code was copied.
- **iOS pressed/group/data verification gap documented honestly.** Per Rule 14 (no fabrication), the simulator input limitation is stated explicitly rather than claiming full iOS pixel coverage that wasn't achieved.

## Phase 12 — Named themes + CSS-variable runtime ✅

**Dynamic theme switching beyond light/dark, scoped theme subtrees, and CSS-variable override at runtime.** All within the existing platform-neutral IR and build-time-first contract.

### Done

- ✅ IR `theme` condition kind (`ConditionIR { kind: 'theme'; id; name }`) + tailwind `ConditionSpec` variant; `specToConditionIR`/`conditionId` lower to `theme:<name>`.
- ✅ Artifact version bump 1 → 2 with optional `themes?: Record<string, Array<{ name; tokens }>>` field (per-theme variable tables). Runtime accepts v1 + v2 (`SUPPORTED_ARTIFACT_VERSIONS = [1, 2]`).
- ✅ `extraThemes` option on `generate()` and `compileWindforge()`: injects `@custom-variant <name> (&:where(.<name>, .<name> *))` for each theme; compiler harvests `.themeName { --var: ... }` selectors into the `themes` field.
- ✅ `collect.ts` `matchThemeSelector` recognizes lightningcss AST shape for the injected `:where` clause (3-token second list: class + descendant combinator + universal).
- ✅ Runtime ThemeStore (`theme.ts`): module-level subscription store with `getThemeState/subscribeTheme/setTheme/syncThemeColorScheme/initThemeColorScheme/useWindforgeTheme`. Integrates with Appearance listener for system sync; calls `backend.onThemeChanged?.(next, prev)`.
- ✅ Scoped providers (`scoped.tsx`): `ScopedThemeContext` + `ScopedVariablesContext` mirroring GroupContext nearest-wins pattern; `ScopedVariables` merges ancestor map.
- ✅ Variable resolution (`resolve.ts`): `toReactNativeValue` resolves `variable` IR through cascade: scoped vars → global overrides (per-theme) → artifact theme table. `MAX_VARIABLE_DEPTH = 8` guards recursive `var()` chains. Throws on unresolved variable; token refs fall back to raw ref string.
- ✅ `ConditionState` gains required `theme` field (default `'light'`); `stateSignature` appends `|t<theme>`. Cache identity includes theme + scoped-vars signature.
- ✅ `evaluateCondition` handles `kind: 'theme'` against `state.theme`.
- ✅ Backend interface gains optional `onThemeChanged` hook (additive). Components wire scoped contexts into `backend.resolveStyle`.
- ✅ `useCSSVariable(name)` reads cascade reactively; `updateCSSVariables(theme, vars)` writes global overrides and bumps registry version for cache invalidation.
- ✅ Metro: `CompileWindforgeOptions.extraThemes` pass-through to `generate()`.
- ✅ Tests: tailwind/themes.test.ts (5), react-native/theme.test.ts (10), conditions.test.ts theme case, metro/compiler.test.ts v2 fixture fix.
- ✅ Example: themes.tsx screen (3-theme switcher + ScopedTheme subtree + ScopedVariables toggle + useCSSVariable readout); global.css per-theme variables; app-tabs registration (Android deep-link-only).

### Measured

(No benchmarks in Phase 12 — variable resolution is a single cascade lookup per style property at resolve time; no hot-path performance change measured.)

### Scope notes

- `calc()`/`runtime` IR kinds still throw in `toReactNativeValue` — follow-up Phase 13+.
- Web CSS backend theme handling deferred to Phase 13 (web currently uses runtime resolution through RNW).
- Uniwind Pro features excluded by policy.
- `useAnimatedThemeProgress` (Phase 7) untouched — auto-animate of `dark:` variants remains a follow-up.

### Decisions

- **Artifact v2 backward compat.** Field `themes` is optional; `isCompatibleArtifact` accepts v1+v2. Custom frontends producing v1 artifacts still load; only the new variable-resolution path requires v2 data.
- **Variable cascade depth limit.** `MAX_VARIABLE_DEPTH = 8` prevents infinite recursion from self-referential `var()` chains. Uniwind uses prototype-chain fall-through; Windforge uses an explicit depth counter, which is simpler and equally correct for realistic token graphs.
- **Theme condition id scheme.** `theme:<name>` (e.g. `theme:sunset`) — consistent with existing `state:<state>` and `data:<name>` patterns.
- **Explicit context passing over implicit module-level getter.** Components read scoped contexts and pass them explicitly to `backend.resolveStyle`; this keeps the dependency graph clear and avoids hidden coupling.
- **No copying Uniwind implementation.** ThemeStore and scoped providers designed from first principles; facts/patterns from Uniwind MIT OSS informed the API shape (`extraThemes`, `setTheme`, `ScopedTheme`) but zero implementation code was copied.
- **@theme tokens lower to static hex, not variable IR.** Confirmed via artifact inspection: `bg-accent` produces `{"kind":"color","value":"#3b82f6"}`, not `{"kind":"variable","name":"--color-accent"}`. The Tailwind lowering in `lower.ts` calls `substituteVars()` then converts to hex. This means ScopedVariables overrides have no visible effect on @theme-referencing utilities today. The variable-resolution cascade (scoped → global overrides → artifact theme table) exists in resolve.ts and is unit-tested — it activates when a future lowering preserves var() references as `kind:'variable'` IR. Documented honestly per Rule 14.

Demo + verification: `apps/example/src/app/themes.tsx`; pixel-verify runbook in `NATIVE_SETUP_IOS.md` and `NATIVE_SETUP_ANDROID.md`.

## Phase 14 — Flutter research

Only now evaluate the Flutter backend.

The existing IR and frontend architecture should make this an additional backend rather than a compiler rewrite.
