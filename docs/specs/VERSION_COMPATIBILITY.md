# Windforge Version Compatibility Policy

## Current development baseline

- React Native: 0.86 baseline (example: 0.86.2)
- Expo SDK: 57 baseline
- New Architecture: required
- Reanimated: `react-native-reanimated ^4.5` (example: 4.5.1) with
  `react-native-worklets ^0.10` (example: 0.10.1) — declared as the peer
  ranges of `@windforge/reanimated` and verified against its
  `package.json`; the adapter is optional (only `@windforge/reanimated`
  depends on it, the compiler/runtime do not)

Exact package ranges must be verified during release rather than guessed.

## Compatibility matrix

Track at least:

| Windforge | RN | Expo | Reanimated | Nitro | New Arch |
|---|---|---|---|---|---|
| development | 0.86 (`>=0.83 <0.87`) | SDK 57 | `^4.5` + worklets `^0.10` (verified 4.5.1/0.10.1) | optional/verified | required |

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
