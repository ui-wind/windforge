# Windforge AI Reading Guide

## Purpose

This document is the entry point for AI agents (Codex, Claude Code, Gemini, Cursor agents, etc.) working on Windforge.

The agent MUST read this file before making architectural or implementation changes.

## Product definition

Windforge is an open-source, free styling framework for React Native New Architecture with:

- Tailwind-first developer experience
- React Native + React Native Web as the first platform family
- compile-time style extraction
- platform-independent Style IR
- Fabric-aware native backend
- first-class Reanimated integration
- optional JSI/Nitro/C++ acceleration
- extensible frontend/backend architecture
- future Flutter backend without redesigning the compiler core

Legacy React Native Architecture is out of scope.

## Mandatory reading order

### Level 0 — Always read

1. `WINDFORGE_ARCHITECTURE.md`
2. `WINDFORGE_SKILL.md`
3. `WINDFORGE_MASTER_PROMPT.md`
4. `docs/AI_AGENT_RULES.md`

### Level 1 — Before compiler work

5. `docs/specs/TAILWIND_COMPILER_AND_PARSER_SPEC.md`
6. `docs/specs/CODE_STRUCTURE_AND_PACKAGE_DESIGN.md`
7. `docs/specs/STYLE_IR_SPEC.md`
8. `docs/specs/COMPILER_PIPELINE_SPEC.md`

### Level 2 — Before feature work

9. `docs/reference/UNIWind_NATIVEWIND_REFERENCE.md`
10. `docs/specs/FEATURE_PARITY_MATRIX.md`
11. `docs/specs/REANIMATED_INTEGRATION_SPEC.md`
12. `docs/specs/RN_FABRIC_NATIVE_BACKEND_SPEC.md`
13. `docs/specs/WEB_BACKEND_SPEC.md`

### Level 3 — Before native acceleration

14. `docs/specs/NATIVE_ACCELERATION_SPEC.md`
15. `docs/specs/VERSION_COMPATIBILITY.md`
16. `docs/specs/PERFORMANCE_BENCHMARK_SPEC.md`

### Level 4 — Before extension work

17. `docs/specs/EXTENSION_API_SPEC.md`
18. `docs/specs/FLUTTER_BACKEND_FUTURE.md`

## Source hierarchy

When sources conflict, use this order:

1. Existing Windforge source code and tests
2. Explicit product/architecture decisions in Windforge docs
3. Official React Native / Expo / Reanimated / Tailwind documentation
4. Official Uniwind documentation
5. Official NativeWind documentation
6. Open-source implementation details used only as reference
7. General model knowledge

Never silently invent behavior when a higher-level source is available.

## Research rule

Uniwind and NativeWind are reference implementations, not dependencies.

Study:

- public API
- supported behavior
- compiler concepts
- runtime boundaries
- compatibility constraints
- performance claims and how they are measured

Do NOT copy proprietary code, binaries, generated artifacts, or internal implementation details.

## Feature implementation protocol

For every feature:

```text
Requirement
  ↓
Reference behavior
  ↓
Capability analysis
  ↓
Architectural layer
  ↓
IR representation
  ↓
Compiler/lowering
  ↓
Runtime/backend
  ↓
Tests
  ↓
Benchmark
  ↓
Documentation
```

The agent MUST identify the correct layer before writing code.

## Platform rule

Shared:

- className API
- Tailwind frontend
- parser
- AST
- Style IR
- optimizer
- theme/token model

Native-specific:

- Fabric
- JSI/Nitro
- C++
- safe-area native metrics
- ShadowTree behavior
- Reanimated native integration

Web-specific:

- React Native Web
- CSS generation/lowering
- DOM/CSS capabilities
- SSR behavior

## Definition of done

A feature is not complete until:

- implementation exists at the correct layer
- unit tests exist
- cross-platform behavior is tested when applicable
- snapshots/fixtures exist for compiler output
- performance-sensitive paths have benchmarks
- docs are updated
- compatibility impact is recorded
