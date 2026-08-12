# Windforge Example

Example app for [Windforge](../../README.md) — Expo SDK 57 / React Native 0.86, New Architecture (mandatory: RN ≥0.81 removed the Legacy Architecture entirely).

## Baseline versions

| Dependency | Version |
|---|---|
| expo | ~57.0.12 |
| react-native | 0.86.2 |
| react | 19.2.3 |
| react-native-reanimated | 4.5.1 |
| react-native-web | ~0.21.0 |

## Running

From the repo root (pnpm workspace):

```bash
pnpm install

# web
pnpm --filter windforge-example web

# native — requires prebuild first (native dirs are gitignored)
cd apps/example
npx expo prebuild
pnpm ios      # or: pnpm android
```

Note: Expo Go is **not** a Windforge runtime target — use development builds.

## Windforge integration status

- Phase 0: `metro.config.js` wraps the Metro config with `withWindforge` from `@windforge/metro`. No style compilation happens yet; the seam exists so Phase 1 (Tailwind v4 → Style IR pipeline) plugs in without changing this file.
- Entry CSS for Phase 1: `src/global.css`.

## Template notes

This app is generated from the Expo SDK 57 default template (expo-router) with template boilerplate removed. Routing lives in `src/app/`.
