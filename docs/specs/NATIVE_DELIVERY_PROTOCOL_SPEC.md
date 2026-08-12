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

The backend initiates a commit itself (ShadowTreeSynchronizer) so a
condition-only change lands with zero React involvement. This is the
highest-risk part of the system.

**Kill criteria — all must pass in the benchmark harness before the mode
ships:**

1. **Torn frames.** No mixed old/new style values within a single rendered
   frame during a condition change. A direct commit must apply the whole
   className diff atomically, in one tree revision.
2. **Fast-toggle consistency.** Rapidly toggling a condition (e.g.
   color-scheme light↔dark, 30+ toggles/second) must converge to the final
   state with no stale bindings surviving; no growing backlog, no unbounded
   retry queues.
3. **Concurrent React commits.** A direct commit interleaved with a React
   commit must not lose either party's changes. The synchronizer must detect
   a concurrent React revision and rebase or defer, never overwrite.
4. **Unmount race.** A node unmounting during a direct commit must not crash
   (no dangling family, no write into a discarded tree). The prune-at-commit
   walk covers this on the piggyback path and must cover it here too.

No "zero re-render" statement is published until this mode passes all four
criteria and its benchmark is attached (architecture §9/§20).

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
