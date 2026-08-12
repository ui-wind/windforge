# React Native Fabric Native Backend Specification

## Scope

This backend is for React Native New Architecture only.

## Responsibilities

The backend owns:

- React Native style property lowering
- Fabric-specific update strategy
- native metrics
- ShadowTree integration where supported
- native cache
- JSI/Nitro adapters

## Non-responsibilities

The backend must not own:

- Tailwind parsing
- Tailwind class names
- CSS parsing
- core theme syntax
- Style IR semantics

## Native update modes

Windforge provides several implementations behind one `StyleBackend` interface:

```text
StyleBackend
├── js-baseline  — JS resolution + React props (default, fallback, web parity)
├── fabric       — build-time map + native registry + ShadowTree delivery
└── (future)     — JSI / Nitro transport variants behind the same protocol
```

Selection must be explicit (`js-baseline` is the default; `fabric` is
opt-in) and version-compatible.

## Ownership of conditions vs delivery

The split that makes native delivery cheap:

- **Resolution happens at build time.** The compiler produces a
  `className → resolved style` map in the artifact. The native layer never
  resolves Tailwind and never holds a per-component resolver.
- **Condition observation stays in JS.** `Appearance` / `Dimensions`
  subscriptions live in the provider. On a condition change, JS diffs the
  affected **unique classNames** (flyweight: O(unique classes), not
  O(components)) and pushes one update per change through the protocol.
- **Delivery is owned by the backend.** The native side owns the
  `className → style` registry, the `family → className` bindings, and the
  ShadowTree merge/commit strategy.

Components do not re-render on condition changes when the fabric backend is
active and the native module is reachable. If the native module is absent or
fails, the fabric backend degrades to js-baseline behavior with a warning.

## Native delivery protocol

The JS↔native contract is specified in `NATIVE_DELIVERY_PROTOCOL_SPEC.md`:
`registerStyles`, `link`, `suspend`, `unlink`, `updateStyles`,
`getDiagnostics`. The backend owns the native side of that contract and the
threading around it; nothing outside the backend may touch Fabric types
(architecture §14).

## Family-keyed registry

Native bindings are keyed by `ShadowNodeFamily`, never raw `ShadowNode*`:
family identity survives the immutable clones React performs on every commit,
while a raw node pointer dangles as soon as React commits. Tag → family
resolution happens on the thread that owns the tag; deprecated lookup APIs are
spike plumbing only. The committed tree is the source of truth for liveness —
bindings for unmounted families are pruned by walking the tree at commit time
(unmount callbacks can be missed).

## Commit modes

The fabric backend supports two commit strategies, in order of risk:

1. **Piggyback commit (Phase 3).** Merge pending style bindings into React's
   own commit transaction via `UIManagerCommitHook::shadowTreeWillCommit`,
   returning a cloned root with merged props. Fabric commits it atomically —
   no race with React, no torn frames. Proven by the commit-hook spike
   (`spikes/fabric-commit-hook/`, verdict GO). This mode removes the
   re-render of the styled tree on condition changes but still rides on a
   React commit to land the update.

2. **Direct native commit (Phase 4).** The backend commits style-only
   changes itself (ShadowTreeSynchronizer), so a condition change lands with
   zero React involvement. This is the highest-risk part of the system and is
   gated by explicit kill criteria (see `NATIVE_DELIVERY_PROTOCOL_SPEC.md`).
   Until it passes them and is benchmarked, no zero-re-render claim is made
   (architecture §9/§20).

The hook rides on React-initiated commits only (`React`,
`ReactRevisionMerge`); commits originating from the animation backend are
passed through untouched, mirroring Meta's own `AnimationBackendCommitHook`
guard. Exceptions never cross the `noexcept` boundary into the render
pipeline — pending bindings retry on the next commit.

**Persistence alternative (Phase 4 option).** Instead of re-merging on every
React commit, pushed styles can be merged into the node family's
`nativeProps_DEPRECATED` field: RN's own `cloneNode` re-applies it on React
commits and gives it precedence over React's raw props (this is how
react-native-unistyles persists). Cheaper per commit, but it relies on a
deprecated RN field and needs explicit cleanup on re-link. The commit hook
stays primary until benchmarks say otherwise; see
`reference/UNISTYLES_REFERENCE.md` for the full trade-off table.

## ShadowTree

ShadowTree integration is a performance optimization and must be isolated.

Do not expose private Fabric mutation details to the compiler.

## Native metrics

Potential metrics:

- safe area insets
- font scale
- pixel ratio
- platform
- layout direction
- dimensions

Metrics should be exposed as stable backend capabilities.

## Compatibility

Native code must maintain explicit version adapters for React Native changes.

Do not assume a private React Native API remains stable across 0.86, 0.87, or later releases.
