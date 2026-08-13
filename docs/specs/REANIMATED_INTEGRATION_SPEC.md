# Windforge Reanimated Integration Specification

## Goal

Make animation a first-class styling capability while keeping the core compiler independent from Reanimated.

Current target: Reanimated 4-compatible architecture.

## Status (2026-08-13, Phase 6 P0)

Implemented — see `docs/IMPLEMENTATION_ROADMAP.md` Phase 6 for the full
record:

- Compiler independence is structural: `AnimationIR`/`TransitionIR` in
  `@windforge/ir` carry no Reanimated types (architecture Rule 2), and the
  planner in `packages/reanimated/src/compile.ts` is a pure module that emits
  easing descriptors instead of Reanimated objects — only
  `components.tsx`/`conditions.ts` import Reanimated.
- Static animation (`animate-*`) and transition (`transition-*`,
  `duration-*`, `ease-*`, `delay-*`) classes compile to animation metadata in
  the artifact and drive `AnimatedView/Text/Image/Pressable` from
  `@windforge/reanimated`. Arbitrary values (`animate-[...]`) are build-path
  only; there is no runtime animation parser (architecture Rule 9 — a runtime
  parser would need its own cache/benchmark story before it exists).
- One worklet-capture constraint shapes the binding: Reanimated deep-freezes
  every plain object a worklet captures
  (software-mansion/react-native-reanimated#5430, intended behavior). The
  SharedValue collection therefore rides a SharedValue snapshot that the
  effects republish with fresh identity on every key-set change; the
  JS-thread registry is never captured by the worklet. Regression-tested in
  `packages/reanimated/tests/components.test.tsx` (the mock freezes every
  published snapshot on assignment).
- Lifecycle states: active state and transition are done (P0). mount/entering,
  exiting, and layout change are the P1 follow-up; theme transition rides
  `useAnimatedConditionState` (SharedValue mirror of the condition store).
- Compatibility ranges: `docs/guides/VERSION_COMPATIBILITY.md`.

## Architecture

```text
Tailwind animation/transition
        ↓
Animation AST
        ↓
Animation IR
        ↓
Reanimated adapter
        ↓
worklet/UI-thread representation
```

## Static animation

Support classes such as:

```text
animate-spin
animate-pulse
animate-[custom]
```

through compiler-generated animation metadata.

## Transition

Model:

```text
transition-* 
 duration-*
 ease-*
```

as transition IR.

The Reanimated adapter decides how to construct the native animation.

## Animated component strategy

Windforge may provide wrappers/adapters for common RN primitives, but the compiler must not require users to manually call `useAnimatedStyle` for supported class-driven animation.

## Shared values

Runtime animated values must remain on the UI thread whenever possible.

Avoid React state for per-frame updates.

## Dynamic animation

Support:

```tsx
<View className={animatedClassName} />
```

only when the dynamic representation can be safely compiled or resolved.

A runtime animation parser must be cached and benchmarked.

## Animation lifecycle

Support target states:

- mount/entering
- active state
- transition
- exiting
- layout change
- theme transition

Theme transition status (Phase 7): shipped as
`useAnimatedThemeProgress()` in `@windforge/reanimated` — a SharedValue
progress 0 (light) ↔ 1 (dark) animated with `withTiming` on every color-scheme
flip (default 400ms, duration 0 under reduced motion), consumed via
`interpolateColor` inside `useAnimatedStyle` so frames run on the UI thread
with zero React renders (verified on the Metrics screen: render counter stays
1 across flips). Auto-animating `dark:` variant flips on styled components
remains the follow-up for this lifecycle state.

## Testing

Every animation feature needs:

- IR fixture
- deterministic compilation test
- iOS test
- Android test
- frame/performance benchmark when applicable
- reduced-motion behavior test where supported
