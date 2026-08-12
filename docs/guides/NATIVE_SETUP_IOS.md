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
   otherwise overwrite merged styles on the next commit.
2. **Direct push** — condition changes with no React commit at all go
   through the first-party `UIManager::updateShadowTree(tagToProps)` API.

## Verifying it works

`getWindforgeStyleModule()` exposes `getDiagnostics(callback)` with live
counters from the native store:

| Counter | Meaning |
| --- | --- |
| `available` | module installed and holding the `UIManager` |
| `styles` | registered classNames |
| `bindings` | live tag → className bindings |
| `styleUpdates` | className registrations/updates received from JS |
| `links` | successful `link()` calls |
| `pushes` | `updateStyles` calls that pushed to the shadow tree |
| `commitsObserved` / `commitsMutated` | React commits seen / mutated by the hook |

After toggling dark mode, expect `pushes` (or `commitsMutated`) to increase
and the UI to update. On the fabric backend the styled tree does not depend
on React re-renders for this update — verify absence of re-renders with the
React DevTools profiler or console assertions if you need evidence for a
claim; see `docs/specs/PERFORMANCE_BENCHMARK_SPEC.md` for the benchmark
methodology.

## Troubleshooting

- **"WindforgeStyle TurboModule not found" warning** — the app is running
  where the pod is not linked (Expo Go, or `expo prebuild` never ran). Use
  `expo run:ios` after prebuild, or rebuild the dev client after adding the
  package.
- **Styles not updating** — call `getDiagnostics()`; if `links` stays at 0,
  components never mounted via the Windforge styled primitives.
- **Stale native code after changes** — `npx expo prebuild --clean && pod
  install` in the app's `ios/` directory.

## Limitations (Phase 3)

- iOS only; Android delivery lands in a later phase.
- `link` resolves a tag → shadow node via
  `findShadowNodeByTag_DEPRECATED` — flagged tech debt
  (`docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md`).
- Direct push rides the first-party `updateShadowTree` BFS
  (`O(tree)` scan per push). The direct-commit optimization (family-keyed
  path, torn-frame kill criteria) is Phase 4.
