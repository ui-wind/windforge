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

## Phase 5 — Dynamic runtime

Add:

- conditional class expressions
- runtime class lookup
- caching
- third-party prop mapping
- diagnostics

Runtime parsing remains a fallback.

## Phase 6 — Reanimated

Implement:

- animation IR
- transition IR
- animate-* support
- keyframes
- class-driven Reanimated 4 integration
- shared value integration
- entering/exiting/layout animation paths

Benchmark frame stability and React render counts.

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
