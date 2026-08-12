# Windforge

> Open-source, free, high-performance styling engine for React Native — Tailwind first, extensible by design.

## Initial target

- React Native New Architecture
- Expo SDK 57 / RN 0.86
- Tailwind-compatible utility classes
- Reanimated
- Metro
- optional JSI/Nitro/native acceleration

## Long-term

Windforge is designed around a platform-independent Style IR so that additional syntaxes and backends can be added later, including Flutter.

## Documents

- `WINDFORGE_ARCHITECTURE.md` — architecture and implementation specification
- `WINDFORGE_SKILL.md` — engineering skill/instructions for AI coding agents
- `WINDFORGE_MASTER_PROMPT.md` — master implementation prompt for Codex/Claude/Gemini/etc.

## Core principle

Tailwind is the first frontend.

React Native is the first backend.

The compiler and Style IR are the core.


## Native Architecture Policy

Windforge supports **React Native New Architecture only**. Fabric is mandatory for native targets. Legacy React Native Architecture and bridge-based fallback runtimes are intentionally unsupported.

Native development uses custom development builds/EAS or bare React Native; Expo Go is not a native runtime target.

## Repository layout

```text
packages/
  ir/        @windforge/ir     — Style IR types, canonical serialization, deterministic hashing
  cli/       @windforge/cli    — `windforge` CLI (Phase 0: compile IR fixtures)
  metro/     @windforge/metro  — withWindforge() Metro integration
apps/
  example/   windforge-example — Expo SDK 57 / RN 0.86 example app
docs/        specifications and agent rules
```

## Development

```bash
pnpm install
pnpm build      # turbo: build all packages
pnpm test       # turbo: run all tests
```

## Status

Phase 0 complete (2026-08-12): monorepo, Style IR + hashing + fixtures, CLI and Metro skeletons, Expo SDK 57 example app verified end-to-end through Metro. No native/C++ code yet, per the roadmap. See `docs/IMPLEMENTATION_ROADMAP.md`.

