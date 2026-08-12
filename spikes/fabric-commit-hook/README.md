# Fabric Commit-Hook Spike

A ~300 LOC C++ spike proving that Windforge can merge resolved className
styles into React Native's own Fabric commits instead of racing them.

> **Status**: reference implementation of the **piggyback commit mode** of
> the native delivery protocol (`docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md`,
> roadmap Phase 3). **Promoted** — the C++ core now lives in
> `packages/native` (`@windforge/native`, iOS) as `StyleRegistry` /
> `StyleCommitHook`, wrapped by the `StyleStore` orchestrator and the
> `WindforgeStyle` TurboModule. This directory stays as-is for historical
> reference and is not built or maintained.

## The bet

A styling engine that mutates the shadow tree from a side thread has a race
with React: React commits tree N, the engine reads it, mutates it to N+1, but
React may already have committed N+2. The visible result is torn frames and
style flicker. The commit-hook approach removes the race by participating in
React's commit transaction: `UIManagerCommitHook::shadowTreeWillCommit` is
invoked with the about-to-commit root and may return a cloned root with extra
props merged in — Fabric commits that tree atomically.

## Verdict

**GO.** The mechanism is viable and — more importantly — first-party:

| Kill criterion | Verdict | Evidence |
| --- | --- | --- |
| API absent/incompatibly changed in RN 0.86 | ✅ exists | `ReactCommon/react/renderer/uimanager/UIManagerCommitHook.h` |
| Hook not invoked in expected lifecycle | ✅ invoked | Meta registers the same hook type for `AnimationBackendCommitHook`, `ViewTransitionModule`, `MutationObserverManager`, and `Scheduler`'s own `EventBeatManager` hook — all shipped in 0.86 |
| Modified root causes crashes/torn frames | ✅ pattern is safe | The in-tree `AnimationBackendCommitHook` does exactly this (`cloneMultiple` + `cloneProps` + `clone`) and is production code |
| Private-API instability across RN versions | ✅ low risk | `UIManagerCommitHook` is not a private API; it is the extension point Meta uses for its own commit-time features. Risk is version skew, not removal. |

### Key findings from the 0.86 headers

1. **Hook shape.** `shadowTreeWillCommit(shadowTree, oldRoot, newRoot, options)`
   returns `RootShadowNode::Unshared`. Returning a different root replaces the
   committed tree for that transaction.

2. **Commit source filter.** `ShadowTreeCommitOptions::source` distinguishes
   `React`, `AnimationEndSync`, and `ReactRevisionMerge`. The hook should ride
   on React commits only (mirroring `AnimationBackendCommitHook`'s guard).

3. **Tree mutation primitives.** `RootShadowNode::cloneMultiple(families, callback)`
   clones the minimal path from the root to every pending family in one pass —
   O(affected nodes), not O(tree). It matches targets by **tag** (walking each
   family's ancestor chain), so the callback must re-check family identity to
   reject stale bindings that collide with a live node's tag.

4. **Props merge.** `ComponentDescriptor::cloneProps(ctx, oldProps, RawProps)`
   overlays a `folly::dynamic` payload onto the node's existing props — the
   exact primitive for "className resolves to a style, merge it into the node."

5. **Registration.** `UIManager::registerCommitHook` / `unregisterCommitHook`
   are public. On iOS the `UIManager` is reachable cleanly via
   `RCTSurfacePresenter.scheduler.uiManager` (both public in 0.86) — no
   private API needed.

## What was built

```
spikes/fabric-commit-hook/
├── include/windforge/fabric/
│   ├── StyleRegistry.h        — family-keyed className bindings + resolved styles
│   ├── StyleCommitHook.h      — the UIManagerCommitHook
│   └── WindforgeStyleModule.h — TurboModule exposing updateStyle/link/… to JS
├── src/
│   ├── StyleRegistry.cpp
│   ├── StyleCommitHook.cpp
│   └── WindforgeStyleModule.cpp
├── ios/
│   ├── WFCommitHookSpikesHost.h
│   └── WFCommitHookSpikesHost.mm
└── CMakeLists.txt             — standalone build skeleton
```

- **StyleRegistry** — keyed by `ShadowNodeFamily::Shared`, never `ShadowNode*`.
  Family identity survives immutable clones across commits; a raw node pointer
  would dangle as soon as React commits. Pending work is detected by a
  generation counter: JS bumps `style->generation` on every `updateStyle`;
  a binding whose `appliedGeneration` lags is pending. `pruneUnmountedEntries`
  walks the committed tree as the source of truth for liveness (unmount
  callbacks can be missed). One coarse mutex; critical sections are short
  because heavy style resolution happens on the JS side outside the lock.

- **StyleCommitHook** — the commit hook itself. On each React commit it:
  prunes dead bindings, collects pending bindings for the committing surface,
  `cloneMultiple`s the root with merged props, marks applied generations, and
  returns the cloned root. If `cloneMultiple` returns `nullptr` (family gone in
  this very commit) it returns the original root untouched. Exceptions never
  cross the `noexcept` boundary into the render pipeline — pending bindings
  simply retry on the next commit.

- **WindforgeStyleModule** — a handwritten TurboModule (not codegen) exposing
  `updateStyle`, `link`, `suspend`, `unlink`, `getDiagnostics` to JS. Tag →
  family lookup uses `findShadowNodeByTag_DEPRECATED` as spike plumbing only;
  production resolves the family on the thread that owns the tag.

## Wiring into a real app

The C++ core is self-contained. The integration steps are deliberately not
implemented here (they are app scaffolding, not the mechanism under test):

1. On iOS, obtain the UIManager: `presenter.scheduler.uiManager`.
2. Construct `WindforgeStyleModule(uiManager, jsInvoker)` and register it with
   the app's `RCTTurboModuleRegistry` under the name `WindforgeStyle`.
3. From JS: `NativeModules.WindforgeStyle.updateStyle('p-4', {padding: 16})`
   once per resolved className, then `link(tag, 'p-4')` for each mounted node.
4. On unmount, `unlink(tag)`. `suspend`/`unlink` map to the link/suspend/unlink
   lifecycle the production runtime will need.

## Risks not resolved by this spike

- **Performance.** The spike proves correctness of the mechanism, not cost.
  `cloneMultiple` clones the ancestor path per pending family; at high node
  counts the commit-thread work needs profiling (roadmap Phase 5 gate).
- **Android/Windows parity.** The hook is platform-agnostic, but the
  UIManager-acquisition path (`presenter.scheduler.uiManager`) is iOS-specific.
  Android's `JNI`/`FabricUIManager` exposure must be verified separately.
- **Version skew.** 0.86 headers were verified. RN 0.87+ may change
  `ShadowTreeCommitSource` or the `cloneMultiple` signature — a version adapter
  is required (architecture §14), which is why the hook is isolated behind
  the RN backend and nothing in parser/frontend/compiler/IR references Fabric
  types.

## Not copied

All code is written against React Native's public C++ headers (`UIManager`,
`ShadowNode`, `RawProps`, `ComponentDescriptor`). No implementation from any
proprietary reference project was copied.
