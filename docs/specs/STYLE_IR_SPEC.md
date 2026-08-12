# Windforge Style IR Specification

## Purpose

Style IR is the stable contract between style-language frontends and platform backends.

The IR MUST NOT import React Native, React Native Web, Reanimated, Nitro, JSI, Fabric, Flutter, or DOM types.

## Goals

The IR must be:

- deterministic
- serializable
- hashable
- optimizable
- versionable
- backend-independent
- capable of representing static and dynamic values
- capable of representing conditional rules
- capable of representing animation metadata

## Conceptual model

```text
StyleSource
  ↓
StyleAST
  ↓
StyleIR
  ├── declarations
  ├── tokens
  ├── conditions
  ├── variants
  ├── animations
  └── metadata
```

## Core types

Illustrative shape:

```ts
type StyleIR = {
  version: number;
  declarations: DeclarationIR[];
  conditions?: ConditionIR[];
  variants?: VariantIR[];
  tokens?: TokenRefIR[];
  animation?: AnimationIR;
  metadata?: SourceMetadata;
};
```

These are conceptual contracts; implementation details may evolve.

## Declaration

A declaration contains:

```ts
{
  property: CanonicalProperty;
  value: IRValue;
  priority?: number;
  sourceOrder?: number;
}
```

The property must be canonical rather than a Tailwind class name.

Example:

```text
p-4
→ padding: 16
```

## Values

Values may represent:

- literal number
- literal string
- color
- token reference
- variable reference
- calc expression
- dimension
- list
- transform
- conditional value
- runtime value reference

## Conditions

The IR must model conditions without hard-coding platform APIs.

Examples:

```text
media(min-width: 768)
color-scheme(dark)
platform(android)
state(active)
container(width > 400)
```

Backends decide how each condition is lowered.

## Animation IR

Animation must be separate from ordinary declarations.

```ts
type AnimationIR = {
  name: string;
  keyframes: KeyframeIR[];
  duration?: TimeIR;
  timingFunction?: TimingFunctionIR;
  iterationCount?: number | "infinite";
  direction?: string;
  fillMode?: string;
};
```

Reanimated-specific objects MUST NOT appear here.

## Static vs dynamic

The compiler should classify values:

```text
STATIC
TOKEN
CONDITIONAL
RUNTIME
ANIMATED
```

Static values should be fully lowered at build time.

## Hashing

Equivalent IR must produce the same canonical hash.

Hashing must ignore:

- source file path
- source line
- debug-only metadata

unless debug mode explicitly requests source-sensitive hashes.

## Versioning

IR has an explicit version.

Backend packages must declare which IR versions they accept.

Breaking IR changes require:

- migration notes
- fixtures
- backend compatibility review
