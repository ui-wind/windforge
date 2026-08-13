# Native Delivery Protocol Specification

The JS↔native contract for delivering Windforge styles into Fabric without
forcing React re-renders. The protocol is transport-agnostic: the first
transport is a TurboModule (`WindforgeStyle`); JSI/Nitro variants may follow
behind the same contract (`RN_FABRIC_NATIVE_BACKEND_SPEC.md`).

The reference implementation of the piggyback commit mode is the Fabric
commit-hook spike (`spikes/fabric-commit-hook/`).

## What the protocol carries

**Key identity.** Every `className` in the protocol is a full className
**string** — the whitespace-normalized version of what the component
received (e.g. `flex-1 bg-white dark:bg-black`), never an individual
utility class. `registerStyles`, `updateStyles` and `link` all agree on
this key, which is what lets native match a binding against a style
registry entry. JS resolves the classes in a string and pushes the merged
style object; native stores merged props only.

- **Style data**: the JS-resolved `className string → merged style` map.
  Values are platform-neutral style props (folly::dynamic on the native
  side) — the protocol carries no Tailwind, no CSS, no IR.
- **Bindings**: `tag → className string` for each mounted styled component.
  The native side resolves tags to `ShadowNodeFamily` and keys its registry
  by family, never by raw node pointer (family identity survives React's
  immutable clones).
- **Updates**: a diff of className strings whose merged resolved values
  changed after a condition change (dark mode, rotation, breakpoint).

Condition observation (Appearance/Dimensions subscriptions) lives in JS. The
native side never subscribes to platform condition events directly.

## JS→native calls

```text
registerStyles(map)      className string → merged resolved style map
link(tag, className)     bind a mounted component's tag to its className string
suspend(tag)             keep the binding but stop applying it (e.g. while
                         an animation owns the props)
unlink(tag)              remove the binding (unmount)
updateStyles(diffMap)    replace merged resolved values for the given className strings
getDiagnostics()         counters: commits observed/mutated, binding count
```

`link`/`unlink` are idempotent. A `link` for a tag whose node is already
unmounted is dropped silently (the committed tree is the source of truth for
liveness — see threading below).

Style values cross the boundary in **native-ready format**: the same shape
React's prop pipeline produces, because the native side feeds them to
`ComponentDescriptor::cloneProps` as raw props and the C++ props parser has
no string-color support (raw CSS strings silently decode to transparent).
Concretely, the JS side runs `processColor` on color properties
(backgroundColor, color, border*Color, …) before `registerStyles`/
`updateStyles`; numeric and string non-color values (16, "0%") pass through
unchanged. The React style-prop path keeps raw strings — RN's own pipeline
processes them.

## Native-side state

```text
StyleRegistry
├── styles:      className string → { props: dynamic, generation: uint64 }
└── bindings:    family → { className string, appliedGeneration, suspended }
```

- `updateStyles` bumps the generation of every touched className.
- A binding is **pending** when its `appliedGeneration` lags the style's
  generation.
- `pruneUnmountedEntries` walks the committed tree to drop bindings for
  unmounted families; unmount callbacks can be missed, so liveness is never
  inferred from them alone.

## Commit modes

### 1. Piggyback commit (Phase 3)

Pending bindings are merged into React's own commit transaction:
`UIManagerCommitHook::shadowTreeWillCommit` returns a cloned root with merged
props, and Fabric commits it atomically. No race with React, no torn frames.

Rules:

- Ride on React-initiated commits only (`React`, `ReactRevisionMerge`).
  Commits sourced from the animation backend pass through untouched.
- Exceptions never cross the `noexcept` boundary; a failed merge retries on
  the next commit (pending bindings are only marked applied after a
  successful clone).
- If the pending families are gone in the very commit being observed, return
  the original root untouched.

A condition change in this mode: JS diffs unique linked className strings →
one `updateStyles` call → the change lands on the next React commit. The
styled tree does not re-render, but delivery still rides on a React commit.

### 2. Direct native commit (Phase 4)

The backend initiates a commit itself (`ShadowTreeSynchronizer`) so a
condition-only change lands with zero React involvement. After
`updateStyles`, it snapshots the pending bindings per surface and commits
each surface's ShadowTree through the first-party
`ShadowTree::commit(transaction, options)` API:

- The snapshot is taken **inside** the registry lock and **copies** the
  resolved props; the commit runs **outside** the lock. The commit runs
  UIManager commit hooks (our own `StyleCommitHook` among them) which take
  that same lock — holding it across the commit would deadlock. Because the
  snapshot escapes the lock, `markApplied` reconciles generations after the
  commit: a binding is only marked applied when its style still carries the
  snapshot's generation, otherwise it stays pending and the next commit
  applies the newer value. No lost updates.
- All pending bindings of a surface merge in **one transaction** — one tree
  revision. Kill criterion 1 holds by construction.
- The transaction re-evaluates against the newest root on every CAS retry
  (React may commit between retries), and `ShadowTree::commit` retries until
  it succeeds — neither party loses a concurrent commit (kill criterion 3).
- A family that is absent from the current root is skipped; if no snapshot
  family survives, the transaction cancels by returning `nullptr`. Families
  are held as `shared_ptr` keys, so nothing dangles (kill criterion 4).
- The registry keeps only the newest generation per className. Fast
  condition toggles converge because every commit applies whatever is
  newest at that instant and anything still pending lands in the next
  commit (direct or React-merged) — no queue, no backlog (kill criterion 2).
- Commits carry source `Unknown` and `mountSynchronously=true` (the default
  for non-React commits). The commit hook's source filter skips them, so
  direct commits are never re-merged.
- **Persistence across React re-commits.** React keeps its own per-fiber
  ShadowNode references from before any native merge and rebuilds the root
  from them on its next commit (`completeRoot`), so a commit arriving after a
  direct commit can resurface pre-merge props. Generation bookkeeping cannot
  detect that — `appliedGeneration` already equals the current generation —
  so the registry also records, per binding, the exact node clone the last
  merge installed (`appliedNode`). On every React commit the hook compares
  each bound family's current node against `appliedNode` and re-merges when
  they differ (node identity changed ⇒ the merged style is gone). This keeps
  the style pinned even under continuous React commits without re-rendering
  React.

Verification evidence lives in `IMPLEMENTATION_ROADMAP.md` (Phase 4) and the
stress screen (`apps/example/src/app/stress.tsx`); the runbook is in
`docs/guides/NATIVE_SETUP_IOS.md`. No "zero re-render" statement is
published without the measurement that backs it (architecture §9/§20).

## Threading

- **JS thread** owns: condition observation, className diffing, all protocol
  calls (`registerStyles`/`link`/`suspend`/`unlink`/`updateStyles`).
  Resolution cost never enters the native lock — the map arrives
  pre-resolved.
- **Commit thread** owns: `shadowTreeWillCommit`, prune, collect-pending,
  clone+merge. One coarse mutex around the registry; critical sections stay
  short because style resolution happens outside the lock.
- **Never**: native-side style resolution, Tailwind/CSS parsing, or
  condition event subscription.

## Failure and degradation

- Native module absent (e.g. web, tests, old app build): the `fabric`
  backend warns once and degrades to js-baseline behavior. No crash.
- A protocol call throws: the binding stays pending; delivery retries on the
  next commit. The JS side does not retry-loop from JS.
- `getDiagnostics` exposes observed/mutated commit counts and binding count
  so the degradation path is observable, not assumed.

## Non-goals

- No runtime Tailwind/CSS parsing (build-time artifact only).
- No group/hover state in v1 — state variants are handled by the component
  layer (re-sending `link` with the active className).
- No per-property animation ownership negotiation yet — `suspend` is the
  only coordination primitive; Reanimated integration is a later phase.
