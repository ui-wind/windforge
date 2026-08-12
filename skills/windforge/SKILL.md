---
name: windforge-engineering
description: Engineering skill for designing and implementing Windforge, an open-source high-performance styling framework focused first on React Native + Tailwind + Reanimated, with a platform-independent compiler/IR and future Flutter backend.
---

# Windforge Engineering Skill

## Mission

Build Windforge as a real framework, not a Tailwind utility wrapper.

Primary target:

- React Native New Architecture ONLY
- Expo SDK 57 / RN 0.86
- Tailwind-compatible syntax
- Reanimated
- Metro compilation
- optional JSI/Nitro acceleration
- Fabric-aware backend

Long-term:

- platform-independent Style IR
- Flutter backend
- custom style syntaxes
- custom backends

## Mandatory architecture rules

**React Native New Architecture ONLY:** Windforge MUST support Fabric/New Architecture and MUST NOT support the Legacy React Native Architecture. No legacy bridge fallback, no dual runtime, and no legacy compatibility shim. If the host is Legacy Architecture, fail clearly.


1. Never put Tailwind semantics directly into the RN runtime.
2. Never put Fabric/Nitro APIs into the compiler core.
3. Style IR must be platform-independent.
4. Reanimated must be treated as a first-class backend/integration.
5. Static styles should be compiled whenever possible.
6. Runtime parsing must be a fallback, not the primary path.
7. Do not claim zero re-renders without measurements.
8. Do not use private React Native APIs unless isolated behind a versioned compatibility layer. Do not add Legacy Architecture compatibility shims.
9. Every performance optimization needs a benchmark.
10. Flutter work starts only after the RN architecture is stable.

## Preferred pipeline

```text
Source
 -> Parser
 -> AST
 -> Transformer
 -> Style IR
 -> Optimizer
 -> Backend
 -> Runtime
```

## When implementing a feature

First classify it as:

- compiler feature
- IR feature
- optimizer feature
- theme feature
- RN backend feature
- Reanimated feature
- native acceleration feature
- extension API

Then implement it at the lowest correct layer.

Example:

`bg-primary` belongs to Tailwind frontend/theme/compiler, not Fabric.

## Performance checklist

For every hot path ask:

- Is parsing happening at runtime?
- Is an object allocated?
- Is React rendering again?
- Is the JS thread involved?
- Can the work happen at compile time?
- Can a shared immutable style be reused?
- Can Reanimated keep frame updates on the UI thread?
- Is native acceleration actually faster?

## Reanimated rules

Never design frame-by-frame animation around React state.

Prefer:

```text
SharedValue
  -> worklet
  -> native/UI update
```

Avoid:

```text
SharedValue
  -> JS callback
  -> React state
  -> render
  -> style object
```

## Compatibility

New Architecture is a hard requirement, not an optional capability.


Maintain an explicit compatibility matrix.

Initial baseline:

- Expo SDK 57
- RN 0.86
- New Architecture ONLY

RN-version-specific native code must be isolated. Every native adapter MUST assume Fabric/New Architecture and MUST fail clearly when Legacy Architecture is detected.

## Package boundaries

Prefer:

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

Do not create packages merely for aesthetics.

## Testing

Every compiler feature requires:

- unit test
- IR snapshot
- integration test where applicable

Native/runtime changes require:

- iOS test
- Android test
- performance benchmark where relevant

## Output expectations

When asked to implement a Windforge feature:

1. Explain which architectural layer owns it.
2. Inspect existing code before changing architecture.
3. Preserve public APIs unless there is a strong reason to break them.
4. Implement the smallest coherent change.
5. Add tests.
6. Add or update benchmarks for performance-sensitive code.
7. Update documentation.
8. Check Expo/RN compatibility.

## Do not

- blindly copy Uniwind
- blindly copy NativeWind
- implement Flutter prematurely
- move everything to C++
- couple the compiler to Nitro
- couple IR to React Native
- add runtime work that Metro could perform
- optimize without profiling

## Web / React Native Web

Windforge targets both native React Native and web through React Native Web.

Treat web as a first-class target, not a compatibility patch.

The shared flow is:

```text
Tailwind syntax
 -> platform-independent IR
 -> platform lowering
 -> Native backend OR Web backend
```

The following must remain shared:

- public `className` API
- parser
- Tailwind frontend
- compiler
- Style IR
- optimizer
- theme/token system

Platform-specific behavior belongs behind backend boundaries.

For web:

- use React Native Web-compatible semantics
- prefer compile-time extraction
- reuse deterministic styles/classes where possible
- support web variants through appropriate web mechanisms
- do not leak browser-only concepts into the core IR unless they are explicitly modeled as cross-platform capabilities

For native:

- keep Fabric/JSI/Reanimated concerns isolated from web
- never assume CSS/DOM APIs exist

Maintain a platform capability matrix and test both native and web for every cross-platform utility family.

## Reference-driven feature development

Before implementing a feature, consult the Windforge reference documents:

- `docs/reference/UNIWind_NATIVEWIND_REFERENCE.md`
- `docs/specs/TAILWIND_COMPILER_AND_PARSER_SPEC.md`
- `docs/specs/CODE_STRUCTURE_AND_PACKAGE_DESIGN.md`
- `docs/specs/FEATURE_PARITY_MATRIX.md`

Use Uniwind for native/Fabric/Reanimated feature parity and NativeWind for Tailwind/CSS interoperability/compiler/DX feature parity.

Classify each requested behavior as:

- source-derived product behavior,
- open-source implementation pattern,
- or independent Windforge design.

Do not copy implementation code. Reimplement behavior through Windforge's own interfaces.

## Tailwind compiler rule

Do not build a hand-written list of a few hundred classes as the final architecture. Windforge requires a real compiler pipeline with candidate extraction, parser, AST, variant resolution, theme resolution, utility plugins, CSS parsing, Style IR, optimization and backend lowering.

The compiler must support Tailwind v4 concepts including `@theme`, `@utility`, `@custom-variant`, `@source`, `@plugin`, and `@apply` to the extent they can be represented by Windforge backends.

## Feature parity rule

Use the feature matrix as the backlog. A feature is not considered complete merely because the syntax parses. It must have:

1. semantic resolution,
2. Style IR representation,
3. backend capability declaration,
4. native and/or web lowering,
5. tests,
6. diagnostics for unsupported cases,
7. benchmark coverage when it affects runtime performance.

## Reanimated rule

Match the product-level behavior of Uniwind Pro where practical:

- animate classes,
- transition classes,
- keyframes,
- entering/exiting classes,
- layout animation classes,
- automatic animated component upgrade.

Keep all Reanimated-specific types behind the Reanimated adapter.

## AI document protocol

Before any non-trivial implementation, read:

```text
AI_READING_GUIDE.md
AI_AGENT_RULES.md
WINDFORGE_ARCHITECTURE.md
WINDFORGE_MASTER_PROMPT.md
```

Then read only the specs relevant to the requested layer.

### Compiler task

Read:

- STYLE_IR_SPEC.md
- COMPILER_PIPELINE_SPEC.md
- TAILWIND_COMPILER_AND_PARSER_SPEC.md
- FEATURE_PARITY_MATRIX.md

### Reanimated task

Read:

- REANIMATED_INTEGRATION_SPEC.md
- FEATURE_PARITY_MATRIX.md

### Fabric/native task

Read:

- RN_FABRIC_NATIVE_BACKEND_SPEC.md
- NATIVE_ACCELERATION_SPEC.md
- VERSION_COMPATIBILITY.md

### Web task

Read:

- WEB_BACKEND_SPEC.md
- FEATURE_PARITY_MATRIX.md

### Extension task

Read:

- EXTENSION_API_SPEC.md
- FLUTTER_BACKEND_FUTURE.md

## AI implementation loop

```text
Read
 ↓
Locate existing implementation
 ↓
Identify architectural layer
 ↓
Check reference behavior
 ↓
Design smallest correct change
 ↓
Implement
 ↓
Test
 ↓
Benchmark if performance-related
 ↓
Update docs
 ↓
Report compatibility impact
```

The agent must not skip directly from a feature request to implementation when the feature crosses compiler/runtime/native boundaries.
