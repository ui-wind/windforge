# Windforge Reference Study — react-native-unistyles

## Purpose

Study of [react-native-unistyles](https://github.com/jpudysz/react-native-unistyles)
(v3.x, MIT) as a reference for Windforge's native delivery design. This repo
is local at `../react-native-unistyles` — read freely, but like every other
reference: patterns and facts only, no copying of implementation into
Windforge sources.

Unistyles is the closest open-source analog of what Windforge's Phase 3/4
builds (C++ core updating Fabric shadow trees outside React), so it is the
best public cross-check of our native delivery assumptions.

## Sources

- Local repo: `../react-native-unistyles` (packages/unistyles)
- Repo: https://github.com/jpudysz/react-native-unistyles
- Docs: https://www.unistyles.dev

## Architecture snapshot (v3.3.0)

- JS API is Babel-plugin driven: `StyleSheet.create` styles get compiled into
  `createUnistyle` calls; there is no runtime Tailwind/CSS parsing in the hot
  path (Windforge's build-time artifact stance matches theirs).
- C++ core (NitroModules hybrid objects): `UnistylesRegistry` holds
  `family → UnistyleData` bindings; `ShadowTrafficController` queues
  `family → rawProps` leaf updates behind one mutex; `ShadowTreeManager`
  flushes them into the shadow tree.
- On RN ≥ 0.81 the flush path is the first-party
  `UIManager::updateShadowTree(tagToProps)` — the same API Windforge's push
  path uses. On older RN they carry a hand-rolled
  "findAffectedNodes/cloneShadowTree" algorithm (documented as based on the
  Reanimated MIT algorithm — the algorithm RN's own `updateShadowTree` was
  later inspired by).

## What we learned

### 1. `nativeProps_DEPRECATED` persistence (validated → Phase 4 option)

Unistyles' push path merges every pushed props map into
`family->nativeProps_DEPRECATED` before calling `updateShadowTree`
(`ShadowTreeManager.cpp`). RN's own pipeline then re-applies it:

- `UIManager::cloneNode` (the React commit path) merges
  `nativeProps_DEPRECATED` with incoming React raw props, and the
  native-managed values **win** over React's values (`UIManager.cpp`).
- `ShadowNode::clone` re-applies `nativeProps_DEPRECATED` whenever a clone
  carries no props of its own (`ShadowNode.cpp`).

In other words, writing into `nativeProps_DEPRECATED` gives free persistence
across React commits, with RN itself enforcing precedence.

Windforge today achieves persistence differently: the commit hook
(`StyleCommitHook::shadowTreeWillCommit`) re-merges pending bindings into
every React-initiated commit. Both approaches converge on the same tree
state. Trade-off comparison:

| | Windforge commit hook (today) | `nativeProps_DEPRECATED` merge |
|---|---|---|
| Commit overhead | Hook runs on every React commit (fast-out when nothing pending) | None — RN does the re-apply inside its own clone path |
| Precedence vs React props | Explicit (hook merges last) | Enforced by RN itself |
| RN API stability | Stable (`UIManagerCommitHook`) | Deprecated family field — could be removed by RN without notice |
| Cleanup | Registry `pruneUnmountedEntries` | `UnistylesRegistry` resets the field on re-link |

Decision recorded for Phase 4: the commit hook stays the primary mechanism
(it is under our control and already verified on simulator). The
`nativeProps_DEPRECATED` merge becomes the fallback/pairing option if
benchmarks show per-commit hook overhead, or if the Phase 4 synchronizer
needs RN-side precedence guarantees without extra cloning. If adopted,
Windforge must mirror Unistyles' re-link cleanup (`nativeProps_DEPRECATED.reset()`),
or a stale family keeps ghost props alive.

### 2. Batching pattern: queue updates, flush once

`ShadowTrafficController` accumulates leaf updates (`setUpdates` merges,
never overwrites interim changes) and a single `updateShadowTree` flush
delivers them in one tree revision. Unistyles exposes explicit `flush()`;
their JS side calls update once per event, not per component.

Windforge's fabric backend already matches this shape (one `updateStyles`
batch per condition change → one `tagToProps` push). The lesson is a
confirmation, plus one adoptable refinement for Phase 4/6: if several
sources enqueue in the same frame (condition change + Reanimated style
commit), merge into the registry before flushing rather than committing
twice.

### 3. Dependency-keyed update scope

`UnistylesRegistry::buildDependencyMap` walks `family → unistyles` bindings
and selects only families whose styles declare a changed dependency
(`UnistyleDependency::THEME`, `Breakpoints`, …). This is the same idea as
Windforge's build-time `dependencies` prefilter (artifact field +
`onConditionsChanged`), which Windforge computes from the artifact instead
of the binding graph. Unistyles' variant confirms the value of filtering by
declared dependencies before touching the tree.

Windforge keeps the build-time version: it works before anything is linked
and costs nothing at runtime.

### 4. Suspend/resume semantics for animations

`linkShadowNodeWithUnistyle` clears suspension, resets
`nativeProps_DEPRECATED`, and drops stale registry + traffic entries for a
re-linked family (`UnistylesRegistry.cpp`); `suspendShadowNode` marks a
family so style pushes skip it while an animation owns its props.

Windforge's protocol already has `suspend`/re-link semantics in the spec;
Unistyles shows the concrete cleanup needed on re-link (clear native-managed
props + pending updates), which matters for the Phase 6 Reanimated
integration.

### 5. Own-commit identification (trait) — dead weight to skip

Unistyles declares a private `ShadowNodeTraits::Trait` bit (`1 << 30`) to
tag their own commits (`UnistylesCommitShadowNode.h`). In 3.3.0 it is
defined but unused. Windforge already solved "don't re-process own commits"
differently (commit-source filter: only `React`/`ReactRevisionMerge` are
merged; the push path marks no trait because `updateShadowTree` commits
carry the default source and are filtered out by direction instead). No
action — noted so a future reader doesn't reach for it.

### 6. Pre-0.81 compatibility is out of scope for Windforge

Unistyles supports RN < 0.81 via the hand-rolled clone algorithm.
Windforge targets New Architecture on current RN only; `updateShadowTree`
exists and the commit hook is verified on 0.86. No back-compat path needed
(matches `VERSION_COMPATIBILITY.md`).

### 7. JS-side condition observation, native-side delivery

Unistyles observes breakpoint/theme changes on the JS side and pushes
resolved updates down; native never subscribes to platform condition
events. Same split Windforge's protocol specifies — cross-checked, not
changed.

## What Windforge deliberately keeps different

- **Commit-hook persistence as primary** (not `nativeProps_DEPRECATED`) —
  under our control, no reliance on a deprecated RN field.
- **Build-time dependency data** (artifact `dependencies`) instead of
  native-side binding-graph dependency maps.
- **className-string protocol keys** (whole className string, never
  individual utilities) — Unistyles keys by unistyle object identity; both
  are valid, Windforge's keeps native free of any style-object model.
- **No NitroModules dependency**: plain ObjC TurboModule + C++ core, so the
  native package has zero third-party runtime requirements.

## Action items

| # | Item | Where | When |
|---|---|---|---|
| 1 | Evaluate `nativeProps_DEPRECATED` persistence as Phase 4 option (incl. re-link cleanup) | `RN_FABRIC_NATIVE_BACKEND_SPEC.md` / Phase 4 | Phase 4 |
| 2 | Merge-before-flush for multi-source update batching (conditions + animation commits) | delivery protocol | Phase 6 |
| 3 | Suspend/re-link cleanup checklist (clear pending updates for re-linked family) | delivery protocol | Phase 6 |
