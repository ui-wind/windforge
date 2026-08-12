# Native Acceleration Specification

## Principle

For dynamic style updates on native platforms (condition changes such as dark
mode, rotation, breakpoints), **native delivery is the primary path**, not a
late-stage optimization. The architecture was anchored to this in 2026-08:
updates should not force React re-renders of the styled tree when the change
can be delivered natively.

This is possible cheaply because of the build-time / runtime split:

- Resolution happens at **build time** (compiler → artifact). The native layer
  receives a `className → resolved style` map; it never resolves Tailwind and
  never holds a per-component resolver.
- The native layer owns only **delivery**: the style registry,
  `family → className` bindings, and the ShadowTree merge/commit strategy.

The JS baseline (`js-baseline` backend) remains:

1. the default runtime,
2. the fallback when the native module is unavailable or fails,
3. the parity reference for the web backend.

Potential delivery technologies (all behind the same delivery protocol):

- TurboModule/JSI transport
- Nitro Modules transport
- C++/Fabric commit-hook and ShadowTree integration

The delivery protocol itself is specified in
`NATIVE_DELIVERY_PROTOCOL_SPEC.md`.

## Required process

Native delivery being the primary path does not suspend the benchmark
discipline. It changes *when* native work starts, not *whether claims require
measurement*.

```text
JS baseline implementation
        ↓
Native delivery protocol behind StyleBackend
        ↓
Piggyback commit mode (rides React commits)
        ↓
Benchmark + kill criteria
        ↓
Direct native commit mode only after criteria pass
        ↓
Publish claims only with the measurement that backs them
```

Rules carried from the architecture (§9/§20):

- No "zero re-render" statement may appear in docs, README, or marketing
  without the benchmark that proves it for the mode being described.
- Piggyback commit removes the re-render of the styled tree but still lands
  inside a React commit transaction — describe it as such.
- Direct native commit is gated by the kill criteria in
  `NATIVE_DELIVERY_PROTOCOL_SPEC.md` (torn frames, fast-toggle consistency,
  unmount race).

## Native boundary

Expose a narrow delivery interface; the concrete JS↔native contract lives in
`NATIVE_DELIVERY_PROTOCOL_SPEC.md`:

```ts
interface NativeStyleEngine {
  registerStyles(map: Record<string, NativeStyleProps>): void;
  link(tag: number, className: string): void;
  suspend(tag: number): void;
  unlink(tag: number): void;
  updateStyles(diff: Record<string, NativeStyleProps>): void;
  getDiagnostics(): NativeStyleDiagnostics;
}
```

The exact wire format is subject to implementation and benchmark evidence.

## Nitro

Nitro must be an adapter option.

Do not make `@windforge/core` or `@windforge/ir` depend on Nitro.

This makes upgrades between Nitro versions or alternative native bindings less invasive.

## C++

C++ should own only data structures and operations proven to benefit from native execution.

Avoid duplicating the compiler in C++ unless profiling proves it necessary.
