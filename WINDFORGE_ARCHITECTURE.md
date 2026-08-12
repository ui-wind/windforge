# Windforge — Architecture & Implementation Specification

## 1. Vision

Windforge is an open-source, free, high-performance styling framework for React Native.

Primary goal:

> Tailwind-like developer experience + compiled style system + zero/minimal unnecessary React re-renders + native acceleration.

The architecture MUST NOT be permanently coupled to Tailwind, but the first-class runtime target is React Native New Architecture.

React Native Legacy Architecture is explicitly out of scope and MUST NOT be supported.

The first production target is:

- React Native New Architecture ONLY
- Expo SDK 57 / React Native 0.86
- Tailwind-compatible utility syntax
- Reanimated integration
- Fabric
- JSI / Nitro where useful
- Metro compiler integration
- Theme support
- Extensible compiler/runtime/backend architecture

Future target:

- Flutter backend (future research; never a reason to add Legacy RN support)
- Other style syntaxes
- Custom design-token systems
- Additional native runtimes

---

# 2. Core architectural principle

Do NOT build "an Uniwind clone".

Build a general style compiler/runtime whose first frontend is Tailwind and whose first backend is React Native.

```text
                    Windforge
                        |
          +-------------+-------------+
          |                           |
   Style Frontends              Runtime Backends
          |                           |
   +------+-------+             +-----+------+
   |              |             |            |
Tailwind       Custom CSS       RN         Flutter
                               Fabric       Dart
                               JSI/Nitro
```

Tailwind is a syntax/frontend, not the core abstraction.

---

# 3. High-level pipeline

```text
className
   |
   v
Parser
   |
   v
AST
   |
   v
Transformer
   |
   v
Style IR
   |
   +------> Static Style
   |
   +------> Theme Token
   |
   +------> Responsive/Variant Rule
   |
   +------> Animation Metadata
   |
   v
Optimizer
   |
   +------> Static extraction
   +------> Deduplication
   +------> Canonicalization
   +------> Constant folding
   +------> Style hashing
   |
   v
Backend
   |
   +------> React Native
   |           |
   |           +--> Fabric
   |           +--> JSI/Nitro
   |           +--> Reanimated
   |
   +------> Flutter (future)
```

---

# 4. Monorepo structure

Recommended:

```text
windforge/
├── apps/
│   ├── docs/
│   ├── playground/
│   └── benchmark/
│
├── packages/
│   ├── core/
│   ├── parser/
│   ├── compiler/
│   ├── ir/
│   ├── optimizer/
│   ├── theme/
│   ├── runtime/
│   │
│   ├── react-native/
│   ├── react-native-fabric/
│   ├── react-native-reanimated/
│   ├── metro/
│   ├── babel/
│   │
│   ├── tailwind/
│   ├── tailwind-preset/
│   │
│   └── cli/
│
├── native/
│   ├── cpp/
│   ├── ios/
│   └── android/
│
├── examples/
│   ├── expo/
│   ├── bare-rn/
│   └── reanimated/
│
├── benchmarks/
├── docs/
├── scripts/
├── turbo.json
├── package.json
└── README.md
```

Do not create every package immediately. Start with the minimum viable architecture and extract packages when boundaries become real.

---

# 5. Style IR

The IR is the most important long-term abstraction.

Example:

```ts
type StyleIR = {
  properties: StyleProperty[];
  variants?: VariantRule[];
  tokens?: TokenReference[];
  animation?: AnimationMetadata;
  source?: SourceLocation;
};
```

A utility:

```text
p-4
```

can become:

```ts
{
  property: "padding",
  value: 16
}
```

A utility:

```text
bg-primary
```

can become:

```ts
{
  property: "backgroundColor",
  value: {
    type: "token",
    name: "primary"
  }
}
```

The IR MUST remain independent from React Native.

---

# 6. Tailwind compatibility

The initial developer experience should feel like Tailwind.

Support should be implemented progressively:

### Tier 1

- p / px / py / pt / pr / pb / pl
- m / mx / my / mt / mr / mb / ml
- w / h / min-w / max-w / min-h / max-h
- flex
- flex-row / flex-col
- items-*
- justify-*
- self-*
- gap
- absolute / relative
- inset / top / right / bottom / left
- z
- overflow
- rounded
- border
- bg
- text
- opacity
- shadow
- aspect
- object-like image sizing where applicable

### Tier 2

- dark
- platform variants
- orientation variants
- pseudo-like state variants where RN supports them
- arbitrary values
- arbitrary colors
- design tokens
- custom variants

### Tier 3

- responsive semantics
- container-like abstractions
- plugin system
- user-defined utilities
- custom compiler transforms

Do not blindly reproduce web CSS. Map only semantics that make sense for RN.

---

# 7. Static extraction

The compiler should detect static className values:

```tsx
<View className="p-4 bg-blue-500 rounded-xl" />
```

and compile them ahead of runtime where possible.

Conceptually:

```ts
const __wf_style_1 = {
  padding: 16,
  backgroundColor: "#3B82F6",
  borderRadius: 12
};
```

Then:

```tsx
<View style={__wf_style_1} />
```

The real implementation may use a more compact representation.

Goals:

- avoid parsing className at runtime
- avoid repeated object allocation
- deduplicate equivalent styles
- hash/canonicalize styles
- maximize native style reuse

---

# 8. Dynamic className

For:

```tsx
<View className={active ? "bg-blue-500" : "bg-red-500"} />
```

the compiler should attempt to resolve both branches.

For:

```tsx
<View className={`bg-${color}-500`} />
```

do not assume arbitrary runtime strings are statically resolvable.

Provide safe fallback mechanisms:

```ts
resolveClassName(className)
```

and/or generated lookup tables.

Never make runtime parsing the primary hot path.

---

# 9. React rendering strategy

The framework should avoid causing component re-renders merely because styles change.

Separate:

```text
React state
   |
   v
Style resolution
   |
   v
Native/UI update
```

from:

```text
React render
   |
   v
JS object creation
```

The design target is:

> Style changes should not require a React render when the change can be handled by the native/Reanimated path.

Do not claim "zero re-render" until benchmarked.

---

# 10. Reanimated integration

Reanimated is a first-class integration, not an afterthought.

Support patterns such as:

```tsx
<Animated.View
  className="w-20 h-20 bg-blue-500 rounded-xl"
/>
```

and animated values driven by Reanimated.

The architecture should distinguish:

```text
Static Style
Dynamic JS Style
SharedValue / Worklet Style
Theme Transition
Layout Animation
```

Potential IR metadata:

```ts
type AnimationMetadata = {
  property: string;
  source: "shared-value" | "derived-value" | "worklet";
  interpolation?: string;
};
```

The Reanimated adapter should minimize JS-thread involvement.

Important:

- do not create a new JS object every frame
- do not route frame-by-frame updates through React
- prefer UI-thread/worklet execution
- benchmark against normal RN styles and existing styling libraries

---

# 11. Theme system

Theme must be independent of Tailwind.

Example:

```ts
const theme = {
  colors: {
    primary: "#2563EB",
    surface: "#FFFFFF",
  },
  spacing: {
    sm: 8,
    md: 12,
    lg: 16,
  },
};
```

Tailwind syntax:

```text
bg-primary p-lg
```

maps to the same IR regardless of frontend syntax.

Theme changes should support optimized updates.

Future direction:

```text
Theme
  |
  +--> static resolution
  |
  +--> dynamic token resolution
  |
  +--> native/shared state
```

---

# 12. Native layer

The native layer is a first-class part of the native backend because Windforge targets React Native New Architecture only. It is introduced incrementally, and every increment must be justified by measurable value.

### Decision note: build-time resolution + native delivery (2026-08)

Native delivery is the primary path for dynamic style updates on native platforms (§9), and it is made cheap by a strict build-time/runtime split:

- **Resolution happens at build time.** The compiler emits a `className → resolved style` map in the artifact. The native layer never resolves Tailwind and never holds a per-component resolver — this is also what keeps the native layer decoupled from RN internals.
- **Condition observation stays in JS.** The provider observes `Appearance`/`Dimensions`; on change, JS diffs the affected unique classNames and pushes one update through the delivery protocol. Styled components do not re-render on condition changes when the native path is active.
- **Delivery is owned by the native layer.** It owns the `className → style` registry, the `family → className` bindings, and the ShadowTree merge/commit strategy (commit modes in `docs/specs/RN_FABRIC_NATIVE_BACKEND_SPEC.md`; protocol in `docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md`).

The JS baseline stays the default runtime, the fallback when the native module is unavailable, and the parity reference for the web backend.

Possible responsibilities:

- style lookup
- compact style representation
- cache
- theme token resolution
- native mutation/update path
- JSI bindings
- Fabric integration

Avoid moving everything to C++ simply because C++ is available.

The rule is:

> JS/TS for orchestration and compilation; native code for hot paths proven by benchmarks.

---

# 13. Nitro Modules

Nitro is an implementation adapter for the New Architecture native runtime. Legacy-architecture bridges are not supported. The compiler/IR must remain independent of Nitro version details.

Keep a clean abstraction:

```text
Windforge Runtime
       |
       v
Native Runtime Adapter
       |
 +-----+------+
 |            |
JSI       Nitro
```

This prevents the compiler and IR from becoming coupled to one Nitro version.

The native API should be intentionally small.

---

# 14. Fabric

Fabric-specific code must live behind the React Native backend.

Do not leak Fabric types into:

- parser
- Tailwind frontend
- compiler
- IR
- theme

Fabric integration may eventually support:

- native style application
- efficient updates
- ShadowNode-related optimization where justified
- batching

Do not directly mutate internal React Native structures without a version compatibility layer.

---

# 15. React Native / Expo compatibility

The first supported environment (and the minimum native architecture requirement):

```text
Expo SDK 57
React Native 0.86
New Architecture
```

The project must have an explicit compatibility matrix.

Example:

```text
Windforge 0.x
├── RN 0.86
├── Expo SDK 57
├── Reanimated supported version
└── New Architecture required
```

Future RN versions should be handled by backend adapters rather than changing the entire core.

---

# 16. Metro integration

Metro is responsible for compile-time transformation.

Potential flow:

```text
Metro
  |
  +--> Windforge transformer
          |
          +--> detect className
          +--> parse
          +--> compile
          +--> emit optimized representation
```

Do not make Metro responsible for style semantics.

The compiler package owns semantics.

---

# 17. Babel integration

Babel may be provided for compatibility or source transformation.

However:

> Metro/compiler should be the primary compilation architecture.

Babel should not become a mandatory runtime dependency if Metro can perform the transformation.

---

# 18. Packaging strategy

Public packages should be independently consumable.

Example:

```text
@windforge/core
@windforge/compiler
@windforge/tailwind
@windforge/react-native
@windforge/reanimated
@windforge/metro
@windforge/cli
```

Optional native package:

```text
@windforge/native
```

Do not force users to install Flutter-related packages.

---

# 19. Extension system

The extension API is a core requirement.

Example conceptual API:

```ts
defineUtility({
  name: "glass",
  compile(ctx) {
    return {
      backgroundColor: "rgba(...)",
      ...
    };
  }
});
```

Custom variants:

```ts
defineVariant("tablet", ...)
```

Custom tokens:

```ts
defineTokens(...)
```

Custom backend:

```ts
defineStyleBackend(...)
```

This is what allows Windforge to eventually support Flutter and other targets.

---

# 20. Performance targets

Do not optimize based on assumptions.

Build benchmarks from day one.

Measure:

### Compile time

- cold compile
- warm compile
- incremental compile
- large class sets

### Runtime

- mount time
- update time
- memory
- allocations
- JS thread work
- UI thread work

### Animation

- frame time
- dropped frames
- JS thread CPU
- UI thread CPU
- allocations/frame

### React

- render count
- commit count
- style object allocations

Compare:

1. normal RN StyleSheet
2. inline styles
3. NativeWind
4. Uniwind where available
5. Windforge

Never publish performance claims without reproducible benchmarks.

---

# 21. Testing strategy

### Unit

- parser
- utility resolver
- variant resolver
- theme
- IR
- optimizer

### Snapshot

- className -> IR
- IR -> RN output

### Integration

- Metro
- Expo
- RN New Architecture
- Reanimated

### E2E

- iOS
- Android

### Performance regression

Automated benchmark thresholds in CI.

---

# 22. Development phases

`docs/IMPLEMENTATION_ROADMAP.md` is the source of truth for phase numbering.
This section is a summary; when the two diverge, the roadmap wins.

## Phase 0 — Architecture foundation ✅

- monorepo
- core interfaces
- Style IR
- test harness
- benchmark harness

## Phase 1 — Tailwind core ✅

- Tailwind v4 toolchain reuse (oxide → lightningcss → Windforge IR)
- static extraction
- variants, dark mode, platform selectors, responsive rules
- end-to-end runtime: registry + condition evaluation + styled components

## Phase 2 — Web backend

- CSS lowering
- deterministic generated classes
- responsive CSS, pseudo states
- SSR-safe output

## Phase 3 — Native delivery foundation

- `StyleBackend` interface (`js-baseline` default, `fabric` opt-in)
- JS↔native delivery protocol (see `docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md`)
- piggyback commit mode: merge styles into React commits via
  `UIManagerCommitHook` (proven by the commit-hook spike)

## Phase 4 — Native direct commit

- ShadowTreeSynchronizer — condition-only updates without React involvement
- kill-criteria-gated; benchmark before any zero-re-render claim

## Phase 5 — Dynamic runtime

- conditional class expressions
- runtime class lookup
- caching
- third-party prop mapping
- diagnostics

## Phase 6 — Reanimated

- Animated.View
- shared values
- worklet-safe output
- animation benchmarks

## Phase 7 — Native metrics/theme transitions

- safe area, font scale, pixel ratio, layout direction
- native theme transitions

## Phase 8 — Extension SDK

- custom utilities
- custom variants
- custom tokens
- custom backends

## Phase 9 — Hardening

- platform matrices, stress tests, benchmark suite

## Phase 10 — Flutter research

Only after RN architecture is stable.

---

# 23. Non-goals

Do NOT initially:

- implement all CSS
- implement Flutter
- rewrite React Native's layout engine
- depend on private RN internals unnecessarily
- make every feature native
- promise zero re-renders without measurement
- optimize before benchmark data exists
- copy Uniwind's implementation

---

# 24. Definition of done for MVP

A developer should be able to install Windforge and write:

```tsx
<View className="flex-1 p-4 bg-white dark:bg-black">
  <Animated.View
    className="w-20 h-20 rounded-xl bg-primary"
  />
</View>
```

with:

- Tailwind-like syntax
- Expo SDK 57
- RN 0.86
- New Architecture ONLY
- Reanimated
- theme tokens
- compile-time extraction
- production Metro integration
- no unnecessary runtime parsing for static classes
- benchmark suite
- TypeScript types
- documentation
- extensibility hooks

---

# 26. React Native New Architecture-only policy

Windforge is explicitly **New Architecture only**. Legacy React Native Architecture support is a non-goal and must not be introduced later as a compatibility layer.

### Required native stack

- Fabric
- TurboModules/JSI-compatible native integration
- Reanimated 4-compatible integration
- Nitro may be used as a native module implementation where beneficial
- Expo development builds / EAS / bare RN builds; Expo Go is not a native runtime target

### Forbidden architecture paths

- Legacy Bridge-based native runtime
- `UIManager`-based style mutation as a primary architecture
- Legacy NativeModules as the Windforge native runtime
- Maintaining separate Legacy and New Architecture implementations

### Runtime contract

At startup/install time, Windforge MUST validate that the host application is running the supported New Architecture. If it is not, fail with a clear actionable diagnostic rather than silently falling back to a slower Legacy implementation.

### Why this is intentional

The project is designed around Fabric/ShadowTree, JSI/native execution and Reanimated UI-thread capabilities. Supporting Legacy Architecture would add a second runtime model, increase maintenance cost, and compromise the performance-oriented design.

### Compatibility matrix

The project should publish a matrix containing:

| Windforge | React Native | Expo | Architecture | Reanimated | Nitro |
|---|---|---|---|---|---|
| 0.x baseline | 0.86 | SDK 57 | **New Architecture only** | compatible v4 | supported adapter range |

A future RN release is supported only after its Fabric/New Architecture adapter passes the full test and benchmark suite.


# 25. Engineering rule

The most important rule of the project:

> Keep the compiler, IR, and style semantics platform-independent. Keep React Native/Fabric/Nitro/Reanimated-specific behavior in adapters.

That single decision is what makes a future Flutter backend possible without rewriting the project.

# 14. Web / React Native Web support

React Native is a multi-platform developer model in this project. Windforge MUST support both native applications and web applications through the same styling API.

Initial platform targets:

```text
                 Windforge Style API
                         |
              +----------+----------+
              |                     |
       React Native            React Native Web
              |                     |
       iOS / Android             Browser
       Fabric / Native        DOM / CSS-compatible
```

The important rule is:

> `className` and the Windforge Style IR should be shared across native and web. Platform-specific lowering happens in the backend, not in the Tailwind parser or core IR.

Example:

```tsx
<View className="p-4 bg-primary rounded-xl" />
```

The same source should be usable in:

- Expo iOS
- Expo Android
- React Native
- Expo Web / React Native Web

The backend decides how the IR is represented for each platform.

## Web backend

Add a web-oriented backend/adapter boundary, for example:

```text
packages/
├── web/
├── react-native/
└── react-native-web/
```

The exact package split can change during implementation. The architectural boundary must remain.

The web target should be able to:

- lower supported Style IR properties to web-compatible output
- reuse the same theme/token system
- reuse variants where their semantics are compatible
- generate/reuse deterministic CSS or web style representations where beneficial
- avoid unnecessary React re-renders
- preserve the same `className` developer experience

Do NOT force web-specific CSS concepts into the platform-independent IR when they cannot be represented consistently on React Native.

## Cross-platform capability model

Not every utility has to behave identically on every platform. The compiler should have an explicit capability model:

```ts
type Platform = 'native' | 'web';

type Capability = {
  platform: Platform;
  property: string;
  supported: boolean;
  lowering?: string;
};
```

Unsupported or platform-specific utilities should produce a clear compiler diagnostic rather than silently generating incorrect output.

## Responsive / web variants

Responsive behavior is a frontend/compiler concern, while the backend decides how to lower it.

For web this may become CSS media-query-oriented output.

For native, the compiler/runtime should use the supported React Native mechanism rather than pretending that browser CSS exists.

Therefore:

```text
Tailwind responsive syntax
          ↓
      Variant IR
          ↓
   +------+------+
   |             |
  Web          Native
 media query   runtime/layout mechanism
```

## Web performance goal

Web must not be treated as an afterthought or as a demo-only target.

Benchmark separately:

- compile time
- generated CSS/style size
- runtime style resolution
- React render count
- startup cost
- repeated class reuse
- dynamic class fallback

The implementation should prefer static extraction and shared style representations on web just as it does on native.

# 27. Reference architecture study — Uniwind and NativeWind

Windforge should target feature parity with the public product behavior of Uniwind Pro and NativeWind, while keeping an independent implementation. See:

- `docs/reference/UNIWind_NATIVEWIND_REFERENCE.md`
- `docs/specs/TAILWIND_COMPILER_AND_PARSER_SPEC.md`
- `docs/specs/CODE_STRUCTURE_AND_PACKAGE_DESIGN.md`
- `docs/specs/FEATURE_PARITY_MATRIX.md`
- `docs/REFERENCE_SOURCES.md`

The most important additions to the architecture are:

1. Tailwind v4 CSS-first frontend support.
2. A real candidate extractor and Tailwind parser rather than a small utility lookup table.
3. CSS → Style IR parsing so custom CSS and Tailwind utilities share the same backend.
4. Explicit variant IR for responsive, platform, pseudo, group, media and container rules.
5. Automatic RN component/prop mapping.
6. Reanimated animation IR for keyframes, transitions, entering, exiting and layout animations.
7. Native metrics IR/runtime support for safe area, font scale and pixel ratio.
8. Native group-state propagation through the Fabric backend.
9. Web lowering as a first-class backend.
10. Capability diagnostics instead of silently accepting CSS that RN cannot represent.

Feature parity is a product requirement; implementation similarity is not. Never copy source code or proprietary binaries from Uniwind Pro.
