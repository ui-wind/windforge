# Native delivery — Android setup

`@windforge/native` is **iOS only**. On Android the example app runs the
`js-baseline` backend: `installNativeDelivery()` detects the missing
TurboModule, warns once, and every styled component resolves through the
normal React render path. All compiler, runtime, dynamic, animation and
extension features work identically — only the native ShadowTree delivery
of condition changes is absent. This guide covers the verified Android
runbook (Phase 9).

Status: **Android verified on the js-baseline backend** (React Native
0.86.2, New Architecture). A fabric-Android adapter is deferred
(`docs/specs/RN_FABRIC_NATIVE_BACKEND_SPEC.md`).

## Requirements

Verified toolchain (2026-08-13, first Android run):

- JDK 17 (`openjdk 17.0.19`); RN 0.86 requires 17, not 21
- Gradle wrapper 9.3.1, Android Gradle Plugin 8.12.0, Kotlin 2.1.20
  (resolved through the Expo version catalog at build time)
- Android SDK with a system image (verified: Pixel_9 AVD, Android 17,
  arm64-v8a)
- `ANDROID_HOME` set; `adb`/`emulator` from the SDK

Windforge itself needs no native code on Android (the js-baseline backend
is pure JS), but the example app's full dependency set is exercised in a
development build. The verified runbook below uses that path; Expo Go was
not verified for this app.

## Setup

1. `app.json` must declare a deterministic package id (it now does):

   ```json
   "android": { "package": "dev.windforge.example", ... }
   ```

2. Generate the native project (not committed; `.gitignore` covers it):

   ```bash
   npx expo prebuild --platform android
   ```

3. Run on an emulator or device. `expo run:android --device` expects the
   AVD *name* in non-interactive shells, not the adb serial:

   ```bash
   npx expo run:android --device Pixel_9
   ```

   First build on this machine: `BUILD SUCCESSFUL in 5m 20s`, 317 tasks
   (Gradle 9.3.1 downloads included on a warm cache; a cold cache adds the
   distribution download).

Headless emulator, for CI-adjacent or unattended runs:

```bash
"$ANDROID_HOME/emulator/emulator" -avd Pixel_9 -no-window -no-audio \
  -gpu swiftshader_indirect -no-boot-anim &
"$ANDROID_HOME/platform-tools/adb" wait-for-device
until [ "$("$ANDROID_HOME/platform-tools/adb" shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 5; done
```

## Verifying it works

Deep links use the `example://` scheme from `app.json`:

```bash
adb shell am start -W -a android.intent.action.VIEW -d "example://explore" dev.windforge.example
adb exec-out screencap -p > explore.png
```

Expected on first launch (logcat, `adb logcat | grep ReactNativeJS`):

- `Running "main" with {... "fabric":true}` — New Architecture active.
- `@windforge/native: WindforgeStyle TurboModule not found. ... Staying on
  the js-baseline backend.` — the designed warn-once degradation.
- `WF2001`/`WF2002` one-time warnings for the deliberate Dynamic-screen
  demos (`grid-cols-3`, `font-mono`, `p-${n}`), same as iOS.

Pixel verification (see `scripts/pixel-sample.mjs`):

| Sample | Light | Dark |
|---|---|---|
| Home root background | `#09090b` | `#18181b` |
| `bg-accent` button | `#3b82f6` | `#3b82f6` |

Platform variants behave per-platform: the Home card `ios:bg-emerald-500`
renders **white** on Android (the `ios:` condition is false), matching the
artifact.

Dark mode flip (system-wide, no app restart needed — the RN
`useColorScheme` subscription updates in place):

```bash
adb shell "cmd uimode night yes"   # dark
adb shell "cmd uimode night no"    # light
```

## Release builds

```bash
npx expo run:android --variant release --device Pixel_9
```

Verified (Phase 9): first release compile `BUILD SUCCESSFUL in 5m 40s`
(384 tasks; the debug cache does not reuse for release), warm reruns 5–19s.
The generated `android/app/build.gradle` signs the release buildType with
`signingConfigs.debug` (Expo template default) — **no keystore is created
or committed**. The APK (~104MB, all ABIs) installs and boots; with Metro
stopped and the app launched via `am start -n
dev.windforge.example/.MainActivity` it renders from the **embedded
bundle**: Home root `#09090b` light / `#18181b` dark at (10,1500), flipped
with `cmd uimode night`.

## Screens verified (Phase 9 matrix)

Home, Explore (Dynamic), Stress — light and dark, via deep links and
`screencap`. Stress runs its 100ms commit tick and mount/unmount churn on
the emulator without crashes; the diagnostics panel refreshes as on iOS.
Animation/Metrics/Extensions render through the same runtime path; their
detailed verification sections live in `NATIVE_SETUP_IOS.md` because the
fabric backend counters (`directCommits`, `commitsMutated`) are iOS-only.

## Interactive screen verification (Phase 11)

The Interactive entry (under **More** in the tab bar;
`apps/example/src/app/interactive.tsx`) demos pseudo-state, group-propagation,
and data-attribute variants. Deep link:

```bash
adb shell am start -W -a android.intent.action.VIEW -d "example://interactive" dev.windforge.example
adb exec-out screencap -p > interactive.png
```

Pixel evidence captured via `adb exec-out screencap -p` + hex sampling
(`scripts/pixel-sample.mjs`). All values from a real Pixel_9 emulator run
(2026-08-13):

| Sample | Idle hex | Active hex | Interaction |
|---|---|---|---|
| Pressed card bg | #3b82f6 | #00bc7d | Long-press (hold 800ms) |
| Focus input bg | #ffffff | #fe9a0b | Tap to focus |
| Disabled Pressable over dark | #224681 | n/a (static) | opacity-50 at idle |
| Disabled TextInput | #848485 | n/a (static) | opacity-50 at idle |
| Anonymous group card bg | #27272a | #3f3f46 | Long-press card |
| Anonymous group child text | #d4d4d8 | #00d492 | Long-press parent card |
| Named group child text | #d4d4d8 | #51a2ff | Long-press parent card |
| Named group control child | #71717b | #71717b (unchanged) | Confirms named-group scoping |
| Data target bg | #27272a | #00bc7d | Tap toggle, then sample target |

## Themes screen verification (Phase 12)

**Android deep-link gap (verified 2026-08-14).** The Themes screen is
not reachable from the bare Android build in this environment: the tab
bar hard-caps at 6 tabs (Home/Explore/Animation/Metrics/Extensions/
Interactive), and the `example://themes` deep link does NOT navigate —
the app stays on the Home screen both on cold launch and warm re-send
(verified: `am start -W -a android.intent.action.VIEW -d "example://themes"`
delivers the intent to the running MainActivity, but the router never
resolves `/themes`; center pixel remains the Home root `#09090b`).

The interactive theme-switch matrix (sunset active `#fb2c36`, ocean active
`#00a6f4`, readout per theme) is therefore verified on the **iOS simulator
only** for Phase 12. This is an expo-router + bare-RN-CLI deep-link
handling gap, not a Windforge styling bug — the styled components, theme
store, and scoped providers are platform-neutral JS and covered by the
unit-test gate.

`bg-accent` is a static token (`#3b82f6`) — Tailwind @theme references are
lowered at build time to hex literals. Per-theme visual changes come from
theme-variant utilities, not from `bg-accent` itself. ScopedVariables
overrides have no visible effect for the same reason (documented honestly
in the roadmap). The expected Android hex values below match the iOS
static matrix (`/tmp/themes-fresh-dark.png`) and the artifact's lowered
values; they remain uncaptured on-device pending the deep-link fix:

| Sample | Expected hex | Status |
|---|---|---|
| Accent card bg | `#3b82f6` (static) | iOS verified; Android pending deep link |
| Sunset-variant card (active) | `#fb2c36` | iOS pending tap; Android pending deep link |
| Ocean-variant card (active) | `#00a6f4` | iOS pending tap; Android pending deep link |
| ScopedTheme subtree card | `#00a6f4` (locked) | iOS verified `#00a6f4`; Android pending |
| `useCSSVariable` readout | `#3b82f6` (light theme) | iOS verified; Android pending |

## Troubleshooting

- **`Could not find device with name: emulator-5554`** — pass the AVD name
  (`Pixel_9`), not the adb serial, to `--device`.
- **`expo run:android` prompts in CI/non-interactive shells** — always pass
  `--device <avd-name>`.
- **Kotlin/AGP version mismatch errors** — the Expo version catalog pins
  them; do not hand-edit `android/build.gradle` versions (the folder is
  generated and never committed).
- **`buildCMakeRelWithDebInfo[x86] FAILED` (ninja error)** — never run two
  `expo run:android`/gradle builds of this project concurrently: they race
  on the shared `.cxx` CMake directory and ninja fails in one of them. A
  single clean release build is green (verified).
- **`INSTALL_FAILED_INSUFFICIENT_STORAGE`** — the default 6GB userdata
  image fills up once debug and release (~104MB APK, extracted) have both
  been installed. `adb uninstall dev.windforge.example` or `adb shell pm
  trim-caches 2G`, then retry.

## Limitations

- No native delivery: condition changes (dark mode, rotation) re-render
  styled components on the JS thread instead of committing directly into
  the ShadowTree.
- `getDiagnostics()` reports `available: false` on Android; the Stress
  screen shows the js-baseline backend name.
- Release builds use the debug signing config from the Expo template
  (`android/app/build.gradle`); no keystore is created or committed.
