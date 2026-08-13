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
