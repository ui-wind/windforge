# Windforge AI Agent Rules

## Rule 1 — Read before editing

Never modify Windforge architecture based only on the current task description.
Read the AI Reading Guide and the relevant specifications first.

## Rule 2 — Do not collapse layers

Never move Tailwind parsing, React Native types, Fabric types, Reanimated types, or Nitro APIs into the core IR unless the specification explicitly requires it.

Preferred dependency direction:

```text
Tailwind/CSS frontend
        ↓
      AST
        ↓
    Style IR
        ↓
   Optimizer
        ↓
  Platform backend
   ↙          ↘
Native        Web
```

## Rule 3 — New Architecture only

Windforge targets React Native New Architecture only.

Do not add:

- legacy bridge fallback
- legacy renderer support
- dual architecture abstractions
- compatibility code whose only purpose is Legacy Architecture

## Rule 4 — Do not overuse native code

C++/JSI/Nitro/Fabric are optimization and backend tools.

Do not move code to C++ simply because it sounds faster.

Require:

1. baseline
2. profiling
3. hypothesis
4. benchmark
5. measurable improvement

## Rule 5 — Do not promise zero re-renders casually

"Zero re-render" is a measurable product property, not an architectural slogan.

A change may claim zero React render only when a test demonstrates that the relevant update path bypasses React rendering.

## Rule 6 — Reanimated must remain frame-safe

Avoid:

```text
UI animation
 → JS callback
 → React state
 → React render
 → style allocation
```

Prefer:

```text
SharedValue
 → worklet/UI thread
 → native update
```

## Rule 7 — Web is first-class

React Native Web is not an afterthought.

Every shared styling feature must define:

- native capability
- web capability
- unsupported behavior
- lowering strategy

## Rule 8 — Tailwind is a frontend

Never make the core compiler depend permanently on Tailwind terminology.

The long-term model is:

```text
Tailwind frontend ─┐
CSS frontend ──────┼→ Style IR → backends
Custom frontend ───┘
```

## Rule 9 — Runtime fallback is controlled

Static class strings and statically discoverable conditional classes should be compiled.

Runtime parsing is reserved for cases that cannot be known at build time.

Runtime fallback must be:

- cached
- deterministic
- observable in debug mode
- benchmarked

## Rule 10 — Compatibility is explicit

Every native package must declare its supported:

- React Native range
- Expo SDK range
- Reanimated range
- Nitro range, if used
- iOS minimum
- Android minimum

Do not infer compatibility from package installation success.

## Rule 11 — Tests are architectural evidence

Compiler changes need fixtures/snapshots.
Native changes need platform tests.
Performance changes need benchmarks.

## Rule 12 — Reference behavior, independent implementation

Uniwind and NativeWind are used to understand product behavior and public concepts.

Do not copy their source implementation or proprietary internals.

## Rule 13 — Keep a decision record

When an implementation choice is not obvious, add an ADR or update the architecture decision log.

Record:

- problem
- options
- decision
- reason
- consequences

## Rule 14 — Stop when requirements conflict

If a requested implementation violates the architecture, explain the conflict before coding.
Do not silently weaken the architecture.
