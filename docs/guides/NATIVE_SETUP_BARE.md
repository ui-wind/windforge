# Bare React Native CLI setup

`apps/bare` is a plain React Native CLI app (no Expo) wired to Windforge
through `@windforge/metro`. It exists to prove the compiler and runtime on
the non-Expo path: `getDefaultConfig` from `@react-native/metro-config`
instead of `expo/metro-config`, `@react-native/babel-preset` without Expo
plugins, and native folders treated as committed source. This guide covers
the verified runbook (Phase 10).

Status: **bare RN CLI verified on iOS and Android** (React Native 0.86.2,
`@react-native-community/cli` 20.1.0, New Architecture, js-baseline
backend).

## How the wiring works

- `metro.config.js` awaits `compileWindforge({ entry, base, outputDir })`,
  then merges `getDefaultConfig(__dirname)` with `watchFolders` pointing at
  the workspace root (pnpm symlinks live outside the app root) and wraps the
  result in `withWindforge`. Nothing Expo-specific is required by
  `@windforge/metro` — it operates on the structural `MetroConfigLike`.
- `babel.config.js` is only `module.exports = { presets: ['module:@react-native/babel-preset'] }`.
- `src/global.css` is the Tailwind entry (`@import "tailwindcss";` plus an
  `@theme` token); the artifact lands in `.windforge/` and the app imports it
  once with `import 'windforge/generated';`, typed by `windforge.d.ts`
  (`declare module 'windforge/generated';`).
- Unlike `apps/example`, **`ios/` and `android/` are committed source** here
  (bare CLI apps own their native projects). `.gitignore` covers only build
  output (`ios/Pods/`, `android/.gradle/`, `vendor/`, `.windforge/`, …).

## Requirements

Verified toolchain (2026-08-14):

- Node 22, pnpm workspace install from the repo root
- iOS: Xcode toolchain + CocoaPods (Ruby from the template `Gemfile`)
- Android: JDK 17, Android SDK with a system image (verified: Pixel_9 AVD,
  arm64-v8a), `adb` on PATH

## Setup (iOS)

```bash
cd apps/bare
pnpm install                     # workspace-wide, from the root is fine too
bundle install                   # template Gemfile (CocoaPods)
cd ios && pod install && cd ..   # 75 pods verified
pnpm start                       # Metro on :8081 (separate terminal)
pnpm exec react-native run-ios --udid <simulator-udid>
```

`app.json` keeps `"name": "Bare"` — `AppDelegate.swift` hard-codes that
module name, so the app folder name and `app.json` name must stay in sync
with the template source.

## Setup (Android)

```bash
cd apps/bare
pnpm start                       # Metro on :8081 (separate terminal)
pnpm exec react-native run-android
```

pnpm-specific gotcha: `android/settings.gradle` does
`includeBuild("../node_modules/@react-native/gradle-plugin")`, which assumes
a hoisted layout. With pnpm the package only appears in the app's
`node_modules/@react-native/` if declared, so `@react-native/gradle-plugin`
is an explicit devDependency of `apps/bare` (same version as `react-native`).

If Metro is already running, `run-android` reuses it; pass `--no-packager`
to skip the packager launch step entirely.

## Verifying it works

The demo screen shows the `@theme` accent token, light/dark zinc pairs and a
button cycling system → light → dark through `WindforgeProvider`'s
`colorScheme` override. Pixel verification (`scripts/pixel-sample.mjs`),
all exact:

| Sample | iOS light | iOS dark | Android light | Android dark |
|---|---|---|---|---|
| root background (`bg-zinc-100` / `dark:bg-zinc-950`) | `#f4f4f5` | `#09090b` | `#f4f4f5` | `#09090b` |
| `bg-accent` (`--color-accent: #3b82f6`) | `#3b82f6` | `#3b82f6` | `#3b82f6` | `#3b82f6` |
| `bg-zinc-300` / `dark:bg-zinc-700` | `#d4d4d8` | `#3f3f46` | `#d4d4d8` | `#3f3f46` |
| `bg-zinc-900` / `dark:bg-zinc-50` | `#18181b` | `#fafafa` | `#18181b` | `#fafafa` |
| `bg-rose-500` (saturated oklch) | `#ff2056` | `#ff2056` | `#ff2056` | `#ff2056` |
| card (`bg-zinc-50` / `dark:bg-zinc-900`) | `#fafafa` | `#18181b` | `#fafafa` | `#18181b` |
| button (`bg-zinc-900` / `dark:bg-zinc-50`) | `#18181b` | `#fafafa` | `#18181b` | `#fafafa` |

System-scheme following verified with the button left at `system`:
`xcrun simctl ui <udid> appearance dark|light` on iOS,
`adb shell "cmd uimode night yes|no"` on Android.

`bg-rose-500` is the gamut-mapping canary: Tailwind v4's saturated oklch
values sit slightly outside sRGB, so the pixel proves the oklch→sRGB
lowering (chroma at the gamut boundary), not just palette lookup.

## HMR / watch mode

`compileWindforge` starts a file watcher (on by default, off in CI or with
`watch: false`): adding or editing a class anywhere under the app sources
rewrites `.windforge/generated.js` in place (debounced 100ms, write skipped
when bytes are unchanged). The artifact lives inside the project root, so
Metro's own watcher invalidates the `windforge/generated` module and pushes
an HMR update — no Metro restart, no resolver trickery, no patching of Metro
internals. Verified: adding `bg-rose-500` to a source file changed the
artifact hash and the running app rendered the new swatch via HMR with the
same Metro process; deleting the change restored the previous artifact
byte-for-byte.

## Differences from the Expo path

| | `apps/example` (Expo) | `apps/bare` (RN CLI) |
|---|---|---|
| Metro default config | `expo/metro-config` | `@react-native/metro-config` |
| Babel | `babel-preset-expo` | `@react-native/babel-preset` |
| Native folders | generated (`expo prebuild`), never committed | committed source |
| Backend exercised | fabric (iOS) via `@windforge/native` | js-baseline (both platforms) |
| Deep links / tabs | expo-router | plain `AppRegistry` screen |

The fabric backend is verified in `apps/example`
(`docs/guides/NATIVE_SETUP_IOS.md`); `apps/bare` intentionally exercises the
js-baseline path on both platforms.

## Troubleshooting

- **Port 8081 already in use** — an orphaned Metro holds it:
  `lsof -ti :8081 | xargs kill -9`, then `pnpm start` again.
- **`INSTALL_FAILED_INSUFFICIENT_STORAGE`** — the AVD userdata image is
  full: `adb uninstall <old package>` or `adb shell pm trim-caches 300M`,
  then retry (same gotcha as the Expo Android runbook).
- **`Included build .../@react-native/gradle-plugin does not exist`** — the
  pnpm layout gotcha above; make sure `pnpm install` ran after adding the
  devDependency.
- **White screen / `application has not been registered`** — module name
  mismatch between `app.json` and `AppDelegate.swift`/`MainApplication`;
  keep both at `Bare`.
