# React Native Fabric Native Backend Specification

## Scope

This backend is for React Native New Architecture only.

## Responsibilities

The backend owns:

- React Native style property lowering
- Fabric-specific update strategy
- native metrics
- ShadowTree integration where supported
- native cache
- JSI/Nitro adapters

## Non-responsibilities

The backend must not own:

- Tailwind parsing
- Tailwind class names
- CSS parsing
- core theme syntax
- Style IR semantics

## Native update modes

Windforge may provide several implementations behind one interface:

```text
NativeStyleBackend
├── JS/StyleSheet baseline
├── JSI backend
├── Nitro backend
└── C++/Fabric optimized backend
```

Selection must be explicit and version-compatible.

## ShadowTree

ShadowTree integration is a performance optimization and must be isolated.

Do not expose private Fabric mutation details to the compiler.

## Native metrics

Potential metrics:

- safe area insets
- font scale
- pixel ratio
- platform
- layout direction
- dimensions

Metrics should be exposed as stable backend capabilities.

## Compatibility

Native code must maintain explicit version adapters for React Native changes.

Do not assume a private React Native API remains stable across 0.86, 0.87, or later releases.
