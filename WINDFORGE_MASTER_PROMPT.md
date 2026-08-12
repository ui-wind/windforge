# MASTER IMPLEMENTATION PROMPT — Windforge

You are the principal architect and senior engineer responsible for building **Windforge**, an open-source and free high-performance styling framework.

## Product definition

Windforge is NOT a clone of Uniwind or NativeWind.

It is a general styling compiler/runtime whose first implementation provides:

> Tailwind-like styling for React Native New Architecture with strong compile-time optimization and first-class Reanimated support.

Future versions must be able to support Flutter without redesigning the compiler core.

## Current priority

Focus ONLY on:

1. React Native
2. Expo SDK 57 / RN 0.86
3. New Architecture
4. Tailwind-compatible syntax
5. Reanimated
6. Metro
7. TypeScript
8. performance benchmarking
9. extensibility/package architecture

Flutter is a future backend. Do not implement it yet unless explicitly requested.

---

# Architecture

Use:

```text
Tailwind syntax
      ↓
Parser
      ↓
AST
      ↓
Compiler / Transformer
      ↓
Platform-independent Style IR
      ↓
Optimizer
      ↓
React Native Backend
      ↓
Fabric / JSI / optional Nitro
      ↓
React Native
```

Reanimated is integrated as a specialized runtime/backend path:

```text
className
   ↓
Style IR
   ↓
Reanimated metadata
   ↓
worklet/UI-thread compatible representation
```

## Critical design constraint

The following layers MUST NOT depend on React Native:

- parser
- Tailwind frontend
- compiler
- IR
- optimizer
- theme/token system

React Native-specific code belongs in:

```text
react-native/
fabric/
reanimated/
native/
metro/
```

---

# Repository structure

Create or evolve toward:

```text
windforge/
├── packages/
│   ├── core/
│   ├── ir/
│   ├── parser/
│   ├── compiler/
│   ├── optimizer/
│   ├── theme/
│   ├── runtime/
│   ├── tailwind/
│   ├── react-native/
│   ├── reanimated/
│   ├── metro/
│   └── cli/
├── native/
│   ├── cpp/
│   ├── ios/
│   └── android/
├── examples/
│   ├── expo/
│   └── reanimated/
├── benchmarks/
├── docs/
└── scripts/
```

Do not create empty packages just to match the diagram. Introduce boundaries when code justifies them.

---

# Style IR

Design a stable platform-independent IR.

Example:

```ts
type StyleIR = {
  properties: StyleProperty[];
  variants?: VariantRule[];
  tokens?: TokenReference[];
  animation?: AnimationMetadata;
};
```

The exact design is your responsibility, but it MUST:

- be serializable
- be deterministic
- be hashable
- support optimization
- support static styles
- support dynamic/token values
- support animation metadata
- have no React Native types

---

# Tailwind compatibility

The developer experience should feel like Tailwind.

Start with common utilities:

- spacing
- sizing
- flex
- alignment
- positioning
- z-index
- overflow
- border
- radius
- background
- text
- opacity
- shadow
- aspect ratio
- variants
- arbitrary values where practical

Do not attempt to implement the entire web CSS specification.

Map only semantics that make sense for React Native.

---

# Compile-time extraction

For:

```tsx
<View className="p-4 bg-blue-500 rounded-xl" />
```

prefer compile-time output.

Do not parse the string repeatedly at runtime.

For dynamic expressions:

```tsx
<View className={condition ? "p-4" : "p-8"} />
```

attempt static resolution.

For truly dynamic strings, use a controlled runtime fallback.

---

# Reanimated

Reanimated is a first-class requirement.

The implementation must avoid frame-by-frame React rendering.

Bad:

```text
SharedValue
→ JS
→ React state
→ render
→ style object
```

Preferred:

```text
SharedValue
→ worklet/UI thread
→ native style update
```

Design the IR/runtime so animated properties can be represented separately from static properties.

Do not force Reanimated-specific types into the core IR.

---

# Native acceleration

Do not immediately move everything to C++.

First establish:

1. compiler correctness
2. baseline performance
3. profiling
4. identify actual bottlenecks

Then evaluate:

- JSI
- Nitro
- C++
- Fabric-specific optimizations

Nitro should be an adapter/implementation detail, not the conceptual foundation of Windforge.

---

# Fabric

Fabric integration must be isolated.

Do not spread Fabric internals through the compiler.

If internal/private APIs are unavoidable, isolate them in a versioned compatibility layer.

---

# Performance

Create benchmarks from the beginning.

Compare:

- StyleSheet
- inline styles
- NativeWind
- Uniwind if available in the test environment
- Windforge

Measure:

- compile time
- cold start
- mount time
- update time
- allocations
- memory
- JS thread work
- UI thread work
- React render count
- animation frame time
- dropped frames

Never claim "zero re-render" or "X times faster" without benchmark evidence.

---

# Extension model

The framework MUST be extensible.

Plan APIs for:

```ts
defineUtility(...)
defineVariant(...)
defineTokens(...)
definePreset(...)
defineBackend(...)
```

Tailwind should eventually become one preset/frontend.

The core architecture should allow:

```text
Tailwind
   ↓
Style IR
   ↓
React Native
```

and later:

```text
Custom Syntax
   ↓
Style IR
   ↓
React Native
```

and:

```text
Tailwind
   ↓
Style IR
   ↓
Flutter backend
```

---

# Packaging

Design public packages around real responsibilities:

```text
@windforge/core
@windforge/ir
@windforge/compiler
@windforge/tailwind
@windforge/runtime
@windforge/react-native
@windforge/reanimated
@windforge/metro
@windforge/cli
```

Keep native acceleration optional where practical.

The user should not need Flutter dependencies for a React Native project.

---

# Implementation methodology

Before changing code:

1. Inspect repository structure.
2. Identify existing architecture.
3. Identify build system.
4. Identify RN/Expo/Reanimated versions.
5. Identify current New Architecture setup.
6. Produce a short implementation plan.
7. Implement in small vertical slices.

For every feature:

```text
Design
→ types/interfaces
→ implementation
→ tests
→ integration
→ benchmark
→ documentation
```

Do not make broad speculative refactors.

---

# MVP acceptance criteria

A fresh Expo SDK 57 application should eventually support:

```tsx
<View className="flex-1 p-4 bg-white dark:bg-black">
  <Animated.View
    className="w-20 h-20 rounded-xl bg-primary"
  />
</View>
```

with:

- Tailwind-like syntax
- compile-time extraction
- Expo SDK 57
- RN 0.86
- New Architecture ONLY
- Reanimated
- theme tokens
- Metro integration
- TypeScript
- production build
- tests
- benchmark suite
- extension APIs

---

# First implementation task

Start by inspecting the repository and produce:

1. Current architecture report.
2. Proposed Windforge architecture.
3. Dependency/version matrix.
4. Package boundary proposal.
5. Style IR proposal.
6. Tailwind compiler MVP scope.
7. Reanimated integration design.
8. Metro integration design.
9. Native acceleration roadmap.
10. Benchmark plan.

Do NOT start by writing a large amount of code.

After the architecture is approved, implement Phase 0:

- monorepo foundation
- core interfaces
- Style IR
- parser skeleton
- compiler skeleton
- test harness
- benchmark harness
- Expo example

Then proceed incrementally.

## Final engineering principle

Build the **compiler and IR first**.

React Native New Architecture, Fabric, Reanimated, JSI and Nitro are native backends/integrations.

Tailwind is a frontend syntax/preset.

Flutter is a future backend.

That separation is the foundation of Windforge.

# Web is a first-class target

Windforge MUST support the web because React Native applications can target web through React Native Web.

The initial product therefore has two active targets:

1. React Native native platforms (iOS / Android)
2. React Native Web

Do not design the project as "native first, web later". The compiler architecture must support both from the beginning, while implementation effort may still prioritize native performance.

Use this conceptual pipeline:

```text
                    Tailwind className
                           |
                       Parser / AST
                           |
                     Style Compiler
                           |
                    Platform-neutral IR
                           |
                       Optimizer
                           |
                 +---------+---------+
                 |                   |
          Native Backend        Web Backend
                 |                   |
        Fabric / RN styles     React Native Web
        JSI / optional Nitro   CSS / web styles
        Reanimated
```

## Shared API requirement

This should work with the same source:

```tsx
<View className="p-4 bg-primary rounded-xl" />
```

across:

- Expo iOS
- Expo Android
- React Native
- Expo Web / React Native Web

Do not create separate Tailwind syntax for web and native unless a feature is inherently platform-specific.

## Platform capability model

The compiler must be able to determine whether a Style IR property/variant is supported by the current backend.

Conceptually:

```ts
type Platform = 'native' | 'web';
```

The IR itself MUST NOT contain React Native, DOM, CSSOM, Fabric, or browser-specific runtime objects.

A backend may lower the same IR differently:

```text
padding: 16
    |
    +--> Native: React Native style representation
    |
    +--> Web: CSS/class/style representation
```

Responsive variants are also lowered per platform:

```text
md:p-4
   |
   +--> Web: media-query-compatible output
   |
   +--> Native: supported native responsive mechanism
```

If a feature has no valid native or web lowering, emit a useful diagnostic instead of silently producing incorrect styles.

## Web performance

Benchmark web independently from native.

At minimum measure:

- compiler time
- generated output size
- startup cost
- class/style resolution cost
- repeated class reuse
- dynamic class fallback
- React render count

The web backend should prefer static extraction and shared representations whenever possible.

## Priority

Implementation priority remains:

1. Tailwind frontend
2. platform-independent Style IR
3. React Native backend
4. Reanimated integration
5. React Native Web backend
6. native acceleration / JSI / optional Nitro
7. additional style frontends
8. Flutter backend

Do not implement Flutter before the native + web architecture is stable.

# Reference implementation study requirements

Before implementing major features, read:

- `docs/reference/UNIWind_NATIVEWIND_REFERENCE.md`
- `docs/specs/TAILWIND_COMPILER_AND_PARSER_SPEC.md`
- `docs/specs/CODE_STRUCTURE_AND_PACKAGE_DESIGN.md`
- `docs/specs/FEATURE_PARITY_MATRIX.md`
- `docs/REFERENCE_SOURCES.md`

Use public Uniwind documentation as the primary reference for Pro-level native/Fabric/Reanimated behavior and NativeWind documentation/source as the primary reference for Tailwind/CSS compiler and cross-platform behavior.

## Required feature coverage

Do not stop at basic utilities. The implementation roadmap must cover:

- complete practical Tailwind v4 utility families supported by the RN/web capability model,
- themes and CSS variables,
- platform selectors,
- responsive/media behavior,
- pseudo and group states,
- arbitrary values,
- custom CSS,
- Tailwind v4 directives,
- automatic RN component prop mapping,
- Reanimated 4 className animations,
- keyframes,
- transitions,
- entering/exiting/layout animations,
- native theme transitions,
- native safe-area/platform metrics,
- Fabric ShadowTree update path,
- web/RNW lowering,
- diagnostics,
- monorepo source discovery,
- compiler caching and incremental builds.

## Tailwind parser requirement

Implement a proper compiler pipeline:

```text
content scanner
→ candidate extractor
→ class parser
→ variant parser
→ utility/value resolver
→ Style AST
→ Style IR
→ specificity/conflict analysis
→ optimizer
→ backend lowering
```

Do not make runtime string parsing the primary implementation path.

## Code structure requirement

Use package boundaries from `docs/specs/CODE_STRUCTURE_AND_PACKAGE_DESIGN.md` as the target architecture. Boundaries may be introduced incrementally, but the dependency direction must remain one-way from frontend/compiler to backend adapters.

## Research discipline

When using Uniwind or NativeWind as references:

- copy concepts, not code;
- copy public API behavior where appropriate, not proprietary implementation;
- explicitly record whether a decision came from public documentation, open-source source inspection, or independent Windforge design;
- do not use Uniwind Pro binaries or reverse-engineer proprietary implementation as a dependency.

---

# AI OPERATING PROTOCOL

Before modifying the repository, read:

```text
/docs/AI_READING_GUIDE.md
/docs/AI_AGENT_RULES.md
/WINDFORGE_ARCHITECTURE.md
/WINDFORGE_SKILL.md
/WINDFORGE_MASTER_PROMPT.md
```

Then select the relevant specification documents.

## Required behavior

You are not allowed to invent architecture while implementing a feature.

First determine:

1. What behavior is requested?
2. Is it already covered by Uniwind/NativeWind reference behavior?
3. Which layer owns it?
4. What should its Style IR representation be?
5. Which backend(s) need lowering?
6. Does it affect runtime performance?
7. Does it affect compatibility?

Only then implement.

## Source discipline

Use the following priority:

```text
Windforge source/tests
> Windforge architecture decisions
> official platform docs
> Uniwind docs
> NativeWind docs
> open-source reference code
> general knowledge
```

If evidence is missing, explicitly mark the decision as an assumption instead of presenting it as fact.

## Reference implementation policy

Windforge should aim for feature-level parity with the public behavior of Uniwind Pro and NativeWind, while remaining an independent implementation.

Reference these projects for:

- supported features
- public APIs
- Tailwind behavior
- CSS behavior
- platform semantics
- compiler concepts
- performance methodology

Do not copy proprietary code, binaries, generated artifacts, or internal implementation details.

## Current feature target

The first serious release should target parity across:

- Tailwind v4-style utilities/configuration
- themes/tokens
- CSS variables
- arbitrary values
- variants
- responsive rules
- platform selectors
- pseudo states
- group states
- custom utilities
- custom CSS
- automatic RN className mapping
- React Native Web
- Reanimated class-driven animation
- transitions
- keyframes
- entering/exiting/layout animation paths
- native metrics
- optimized native update paths
- developer diagnostics

Feature priority is governed by `docs/specs/FEATURE_PARITY_MATRIX.md`.

## Native architecture rule

New Architecture is mandatory.

Do not implement Legacy Architecture compatibility.

Native acceleration must be isolated behind backend interfaces and version adapters.

## Performance rule

Never claim:

- zero re-renders
- zero allocations
- UI-thread-only
- native-fast
- faster than Uniwind/NativeWind

without a reproducible benchmark supporting the claim.

## Web rule

React Native Web is a first-class backend.

Do not implement web as a thin afterthought over the native runtime.

## Future Flutter rule

Do not implement Flutter during the initial RN phase.

However, do not introduce React Native-specific types into the core IR or compiler in a way that would prevent a future Flutter backend.

## Completion checklist

Before declaring a task complete:

- [ ] correct layer identified
- [ ] existing implementation inspected
- [ ] tests added/updated
- [ ] compiler fixtures updated if relevant
- [ ] native tests updated if relevant
- [ ] web tests updated if relevant
- [ ] benchmark added/updated if performance-sensitive
- [ ] compatibility checked
- [ ] docs updated
- [ ] no Legacy Architecture support introduced
