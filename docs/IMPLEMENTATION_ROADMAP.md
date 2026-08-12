# Windforge Implementation Roadmap

## Phase 0 — Architecture foundation

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

## Phase 1 — Tailwind core

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

## Phase 3 — Dynamic runtime

Add:

- conditional class expressions
- runtime class lookup
- caching
- third-party prop mapping
- diagnostics

Runtime parsing remains a fallback.

## Phase 4 — Reanimated

Implement:

- animation IR
- transition IR
- animate-* support
- keyframes
- class-driven Reanimated 4 integration
- shared value integration
- entering/exiting/layout animation paths

Benchmark frame stability and React render counts.

## Phase 5 — Native acceleration

Only after profiling.

Evaluate:

- JSI
- Nitro
- C++
- Fabric/ShadowTree

Implement the smallest native path that produces measurable improvement.

## Phase 6 — Native metrics/theme transitions

Implement:

- safe area
- font scale
- pixel ratio
- platform metrics
- layout direction
- native theme transitions

Keep metrics in the backend/capability layer.

## Phase 7 — Extension SDK

Implement:

- defineUtility
- defineVariant
- defineTokens
- definePreset
- custom frontend interface
- custom backend interface

## Phase 8 — Hardening

Run:

- iOS matrix
- Android matrix
- Web matrix
- Expo development builds
- release builds
- compiler stress tests
- monorepo tests
- benchmark suite

## Phase 9 — Flutter research

Only now evaluate the Flutter backend.

The existing IR and frontend architecture should make this an additional backend rather than a compiler rewrite.
