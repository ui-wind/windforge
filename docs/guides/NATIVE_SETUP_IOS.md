# Native delivery — iOS setup

`@windforge/native` delivers condition-driven style updates (dark mode,
rotation, breakpoints) through the Fabric backend: JS diffs the affected
classNames and pushes them to a native store that merges them into the
shadow tree, instead of re-rendering styled components. This guide covers
running it in the example app (Expo managed) or your own Expo/bare app.

Status: **iOS only** (React Native 0.86+, New Architecture). Android is on
the roadmap.

## Requirements

- React Native `>= 0.86` on the New Architecture (no legacy bridge)
- iOS 15.1+ deployment target
- CocoaPods and Xcode toolchain (standard RN iOS setup)

Expo Go **cannot** load custom native modules — run with a development
build (`expo prebuild` + dev client) instead.

## Setup

1. Add the dependency:

   ```bash
   pnpm add @windforge/native
   ```

2. Enable it once, before `WindforgeProvider` mounts — e.g. a
   `src/windforge-setup.ts` imported first from your root layout:

   ```ts
   // src/windforge-setup.ts
   import { installNativeDelivery } from '@windforge/native';
   installNativeDelivery();
   ```

   ```ts
   // src/app/_layout.tsx
   import '@/windforge-setup';
   import { WindforgeProvider } from '@windforge/react-native';
   ```

   The call is platform-aware:

   - **native build with the pod linked** → selects the `fabric` backend
     and installs the adapter.
   - **Expo Go / pod missing** → warns once and stays on `js-baseline`.
   - **web** → silent no-op.

3. Generate the native project (Expo managed):

   ```bash
   npx expo prebuild --platform ios
   ```

   Expo autolinking picks up the `WindforgeNative.podspec` from
   `node_modules/@windforge/native` and adds it to the Podfile — no config
   plugin and no Podfile edits needed. The generated `ios/` folder is not
   committed (`.gitignore` covers it); re-prebuild or `npx expo prebuild
   --clean` when native deps change.

4. Run:

   ```bash
   npx expo run:ios
   ```

## How the module reaches Fabric

The TurboModule receives the surface presenter through RN's standard
`setSurfacePresenter:` injection (the same mechanism Reanimated uses),
takes the `UIManager` via the public
`RCTSurfacePresenter.scheduler.uiManager` path, and builds the native
store. No AppDelegate modification, no KVC.

Two delivery mechanisms cooperate inside the native store:

1. **Commit hook** (`UIManagerCommitHook::shadowTreeWillCommit`) — re-merges
   pending styles into every React commit, because React-owned props would
   otherwise overwrite merged styles on the next commit. It rides on
   React-initiated commits only (`React`, `ReactRevisionMerge`).
2. **Direct native commit** (`ShadowTreeSynchronizer`, Phase 4) — condition
   changes with no React commit at all. `updateStyles` snapshots the
   pending bindings per surface and commits each surface's ShadowTree
   through the first-party `ShadowTree::commit` API; the whole surface
   lands in one transaction and CAS-retries against React's concurrent
   commits. Commits carry source `Unknown`, so the hook above never
   re-merges them.

## Verifying it works

`getWindforgeStyleModule()` exposes `getDiagnostics(callback)` with live
counters from the native store:

| Counter | Meaning |
| --- | --- |
| `available` | module installed and holding the `UIManager` |
| `styles` | registered classNames |
| `bindings` | live family → className bindings |
| `styleUpdates` | className registrations/updates received from JS |
| `links` | successful `link()` calls |
| `directCommits` | condition-only updates committed directly into the ShadowTree |
| `commitsObserved` / `commitsMutated` | React commits seen / mutated by the hook |

After toggling dark mode, expect `directCommits` to increase and the UI to
update. On the fabric backend the styled tree does not depend on React
re-renders for this update — verify absence of re-renders with the React
DevTools profiler or console assertions if you need evidence for a claim;
see `docs/specs/PERFORMANCE_BENCHMARK_SPEC.md` for the benchmark
methodology.

## Stress test runbook (Phase 4 kill criteria)

The example app ships a stress screen (`apps/example/src/app/stress.tsx`)
that runs React commits every 100ms while mounting/unmounting styled nodes
every 400ms. To exercise the direct-commit path under pressure:

```bash
# 1. Boot the simulator and run the app on the Stress tab.

# 2. Flip appearance 60 times while the screen churns:
for i in {1..60}; do
  if [ $((i % 2)) -eq 0 ]; then
    xcrun simctl ui booted appearance dark
  else
    xcrun simctl ui booted appearance light
  fi
  sleep 0.15
done

# 3. On the Stress tab the diagnostics panel auto-refreshes every 2s
#    (the button refreshes on tap as well).
```

Expected outcome (the Phase 4 kill criteria,
`docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md` §2):

- **no crash**; the final appearance matches the last flip;
- `directCommits` increased once per flip that found pending bindings;
- `commitsMutated` tracks `commitsObserved` while the screen churns — the
  hook re-pins the merged style into React's own commits (persistence);
- `bindings` stays bounded (mount/unmount churn does not leak families);
- no unbounded counter growth across the full loop.

## Dynamic screen verification (Phase 5)

The Dynamic tab (`apps/example/src/app/explore.tsx`) exercises the runtime
paths that build-time extraction cannot reach. Run the app and open the
Dynamic tab; the diagnostics panel auto-refreshes every second.

Check the following:

- **ternary / `cx()` toggle** — tap the first box: the background flips
  between `bg-accent` and `bg-zinc-800`. Both branches are string literals, so
  they are in the artifact; runtime only selects one. `cacheHits` climbs.
- **fallback stepper** — tap `+`/`−` on the stepper box. `className` is
  `` `p-${n}` `` with `n ∈ {5,7,9}`, none of which appear as literals, so the
  artifact has no entry and the controlled fallback parser resolves it.
  `fallbackParses` climbs on each new value, and Metro logs a one-time
  `WF2002` (fallback used) the first time. The box's padding visibly changes
  (20pt / 28pt / 36pt).
- **unknown token** — the `grid-cols-3` box intentionally cannot be resolved;
  it appears in `unknownTokens`, and Metro logs a one-time `WF2001` (unknown
  class) in dev. (Phase 6 note: the original demo token was `rotate-45`,
  which the animation work made compilable — `transform` lowering now
  handles it.)
- **prop mapping** — the `styled(Badge)` box renders with `className`
  resolved to `style`; the horizontal `ScrollView` below it uses
  `useWindforgeStyle('gap-3 p-3')` for its `contentContainerStyle`.
- **appearance flip** — flip dark/light; all boxes with `dark:` variants
  update, matching the Home/Stress tabs.

These are the Phase 5 deliverables; build-time resolution remains the primary
path (Home tab).

## Animation screen verification (Phase 6)

The Animation tab (`apps/example/src/app/animation.tsx`) exercises
class-driven animation on the UI thread via `@windforge/reanimated`. The
simulator deep link is `example://animation` (scheme from `app.json`):

```bash
xcrun simctl openurl booted "example://animation"
```

Check the following:

- **animate-spin** — the accent box rotates continuously (Tailwind built-in
  keyframes, 1s linear infinite).
- **animate-spin-slow** — the emerald box rotates via the custom `@theme`
  token `--animate-spin-slow: spin 3s linear infinite` in `global.css`,
  proving theme-token substitution into `AnimationIR`.
- **transition-all toggle** — tap the button: the box animates size and
  color over 500ms ease-in-out. The caption reports the React render count
  of the box — it must read **1 per toggle and stay still between frames**
  (interpolation runs entirely in `useAnimatedStyle`; Rule 6).
- **FPS line** — reads ~60 while both spins and a transition run
  (`useFrameCallback` over a ~1s window).
- **diagnostics row** — `resolves`/`cacheHits` climb only on toggle, never
  per frame; `unknownTokens` shows the deliberate Dynamic-tab demos
  (`grid-cols-3`), nothing animation-related.

Reference measurements (iPhone 17 Pro simulator, dev client, 2026-08-13):
FPS 60 with two infinite keyframes + a 500ms transition running; exactly 1
render per toggle, 0 per frame; diagnostics flat between toggles. These
numbers back the Phase 6 claims in `docs/IMPLEMENTATION_ROADMAP.md`.

Note: on this machine the installed dev build predates the
`dev.windforge.example` bundle identifier rename — `xcrun simctl
listapps booted` shows the installed id (`com.vule94.example`), and
`simctl launch` must target that id, not the one in `app.json`.

## Metrics screen verification (Phase 7)

The Metrics tab (`apps/example/src/app/metrics.tsx`) surfaces the platform-
metrics capability layer, the `rtl:`/`ltr:` variants and the animated theme
progress. The simulator deep link is `example://metrics`:

```bash
xcrun simctl openurl booted "example://metrics"
```

Check the following:

- **metrics panel** — `useMetrics()` values update live. On iPhone 17 Pro
  expect insets `t:62 r:0 b:34 l:0` (notch + home indicator), pixelRatio 3,
  fontScale 1, layoutDirection ltr, window 402x874; `colorScheme` flips with
  the system appearance.
- **rtl:/ltr: boxes** — in an ltr build the first box renders indigo
  (`ltr:bg-indigo-500` overrides the base `bg-accent`) and the second caption
  renders indigo-600 in light mode, indigo-300 in dark (stacked
  `dark:ltr:text-indigo-300` wins over the single `ltr:` variant because
  runtime merge follows class-string order — stacked variants go last); an
  RTL build swaps both to the emerald variants.
- **theme transition box** — flip with
  `xcrun simctl ui booted appearance dark`: the box crossfades light ↔ dark
  over 400ms (`useAnimatedThemeProgress` + `interpolateColor` on the UI
  thread). The caption's React render counter must stay at **1** across flips
  (Rule 6).
- **Metro log** — each flip logs `[windforge] appearance` with the native
  delivery counters (`available: true`, `styleUpdates` climbing) when the dev
  client includes the WindforgeStyle pod.

Reference measurements (iPhone 17 Pro simulator, dev client, 2026-08-13):
panel values as above; ltr box pixel-exact at the artifact values (`#615fff`
background; caption text `#4f39f6` light / `#a3b3ff` dark); the screen is
light-first (`bg-zinc-100` root, white panel) so flipping to dark is a
full-screen change (root `#f4f4f5` → `#09090b`, panel `#ffffff` → `#27272a`);
crossfade settles at `#18181b` with the render counter still 1; appearance
reports show `styleUpdates` 55→74 and `directCommits` 1 across the session's
flips. These numbers back the Phase 7 claims in
`docs/IMPLEMENTATION_ROADMAP.md`.

Note: `@windforge/metro` compiles the artifact once at Metro startup (no file
watcher). After editing `global.css` or adding class literals, restart Metro
— WF2001 warnings for classes that *should* exist in the artifact are the
stale-artifact symptom.

## Extensions screen verification (Phase 8)

The Extensions entry (under **More** in the tab bar;
`apps/example/src/app/extensions.tsx`) demos the Extension SDK
(`apps/example/windforge.config.cjs`), the custom frontend interface and the
backend name. The simulator deep link is `example://extensions`:

```bash
xcrun simctl openurl booted "example://extensions"
```

Check the following:

- **Extension SDK box** — `glass bg-brand land:bg-emerald-500
  dark:bg-lime-500`: light mode renders `#4cce7c` (the `glass` utility's
  0.8 opacity over the page background, brand token `#22c55e`);
  `xcrun simctl ui booted appearance dark` flips it to lime (sampled
  `#65a702`); rotating the simulator to landscape flips it to emerald
  (sampled `#31c795`) via the `land:` `defineVariant`. Rotation requires the
  local `ios/` project to allow landscape — `app.json` now says
  `orientation: default`, but `expo run:ios` does not re-sync orientation
  into an existing generated project, so edit
  `UISupportedInterfaceOrientations` in `ios/example/Info.plist` and rebuild
  (local-only; `ios/` is never committed).
- **Custom frontend box** — `card-pad card-radius bg-indigo-500` from the
  handwritten artifact: padding 20, radius 14, background `#615fff`; no
  WF2001 in the Metro log (the classes come from the second
  `registerArtifact` call in `.windforge/generated.js`).
- **backend row** — reads `fabric`: `installNativeDelivery` still owns
  backend selection, per the `setBackend` ordering contract
  (`docs/specs/EXTENSION_API_SPEC.md`).

Troubleshooting notes from the Phase 8 verification runs:

- **"Open in Expo Go?" alert on every `simctl openurl`** — stale
  LaunchServices registration left behind by Expo Go (even after
  uninstalling it). The alert renders inside the simulated screen and dims
  it, so sampled pixel colors come out ~0.8× darker. Fix: reboot the
  simulator (`xcrun simctl shutdown booted && xcrun simctl boot booted`).
- **Edited `windforge.config.cjs`?** — same rule as `global.css`: the
  artifact compiles once at Metro startup, so restart Metro and terminate
  the app before re-verifying.

## Troubleshooting

- **"WindforgeStyle TurboModule not found" warning** — the app is running
  where the pod is not linked (Expo Go, or `expo prebuild` never ran). Use
  `expo run:ios` after prebuild, or rebuild the dev client after adding the
  package.
- **Styles not updating** — call `getDiagnostics()`; if `links` stays at 0,
  components never mounted via the Windforge styled primitives.
- **Stale native code after changes** — `npx expo prebuild --clean && pod
  install` in the app's `ios/` directory.

## Limitations

- iOS only; Android delivery lands in a later phase.
- `link` resolves a tag → `ShadowNodeFamily` via
  `findShadowNodeByTag_DEPRECATED` — once per mount, off the commit path,
  but still flagged tech debt (`docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md`).
- Persistence across React commits uses the commit hook (re-merge per
  React commit). The `nativeProps_DEPRECATED` alternative is evaluated in
  `reference/UNISTYLES_REFERENCE.md` and stays a backlog option.
