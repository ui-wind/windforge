# Windforge Version Compatibility Policy

## Current development baseline

- React Native: 0.86 baseline
- Expo SDK: 57 baseline
- New Architecture: required
- Reanimated: current version compatible with the baseline

Exact package ranges must be verified during release rather than guessed.

## Compatibility matrix

Track at least:

| Windforge | RN | Expo | Reanimated | Nitro | New Arch |
|---|---|---|---|---|---|
| development | 0.86 | SDK 57 | verified version | optional/verified | required |

## Native adapter rule

When RN changes native/Fabric APIs:

1. identify affected adapter
2. add version-specific implementation only there
3. keep IR/compiler unchanged
4. run native tests
5. run benchmarks
6. update matrix

## Nitro upgrades

Never assume a Nitro version upgrade is source-compatible.

Treat Nitro as a native dependency boundary. Verify:

- generated bindings
- C++ headers
- iOS linkage
- Android linkage
- JSI behavior
- RN compatibility
- Reanimated compatibility

Do not let Nitro version details leak into the public compiler API.
