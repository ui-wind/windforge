# Native Acceleration Specification

## Principle

Native acceleration is optional implementation technology, not the Windforge architecture itself.

Potential technologies:

- JSI
- Nitro Modules
- C++
- Fabric/ShadowTree

## Required process

Never start with native acceleration because it appears faster.

```text
Baseline JS implementation
        ↓
Benchmark
        ↓
Profile
        ↓
Identify bottleneck
        ↓
Native hypothesis
        ↓
Prototype
        ↓
Benchmark again
        ↓
Adopt only if beneficial
```

## Native boundary

Expose narrow interfaces such as:

```ts
interface NativeStyleEngine {
  resolveStyle(id: number): NativeStyleHandle;
  updateStyle(target: number, style: NativeStyleHandle): void;
}
```

The exact API is subject to implementation and benchmark evidence.

## Nitro

Nitro must be an adapter option.

Do not make `@windforge/core` or `@windforge/ir` depend on Nitro.

This makes upgrades between Nitro versions or alternative native bindings less invasive.

## C++

C++ should own only data structures and operations proven to benefit from native execution.

Avoid duplicating the compiler in C++ unless profiling proves it necessary.
