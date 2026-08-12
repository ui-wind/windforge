# Windforge Reanimated Integration Specification

## Goal

Make animation a first-class styling capability while keeping the core compiler independent from Reanimated.

Current target: Reanimated 4-compatible architecture.

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

## Testing

Every animation feature needs:

- IR fixture
- deterministic compilation test
- iOS test
- Android test
- frame/performance benchmark when applicable
- reduced-motion behavior test where supported
