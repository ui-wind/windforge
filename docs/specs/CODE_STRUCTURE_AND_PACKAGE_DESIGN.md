# Windforge Code Structure & Package Design

## Reference philosophy

NativeWind demonstrates a useful separation between CSS/Tailwind compilation, CSS-to-RN interoperability, runtime component mapping, JSX transformation, Metro integration and tests. Uniwind demonstrates a Tailwind v4 + Metro-first structure with a lightweight developer-facing package and a separate native Pro runtime.

Windforge should combine the useful boundaries while keeping its own IR and backend contracts.

## Proposed repository

```text
windforge/
├── apps/
│   ├── docs/
│   ├── playground-native/
│   ├── playground-web/
│   └── benchmark/
│
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── errors/
│   │   │   ├── diagnostics/
│   │   │   ├── cache/
│   │   │   └── index.ts
│   │
│   ├── ir/
│   │   ├── src/
│   │   │   ├── nodes/
│   │   │   ├── declarations/
│   │   │   ├── variants/
│   │   │   ├── tokens/
│   │   │   ├── animation/
│   │   │   └── index.ts
│   │
│   ├── parser/
│   │   ├── src/
│   │   │   ├── candidate-extractor/
│   │   │   ├── class-parser/
│   │   │   ├── variant-parser/
│   │   │   ├── arbitrary-parser/
│   │   │   └── index.ts
│   │
│   ├── compiler/
│   │   ├── src/
│   │   │   ├── pipeline/
│   │   │   ├── resolver/
│   │   │   ├── transformer/
│   │   │   ├── specificity/
│   │   │   └── index.ts
│   │
│   ├── optimizer/
│   │   ├── src/
│   │   │   ├── canonicalize/
│   │   │   ├── dedupe/
│   │   │   ├── constant-folding/
│   │   │   ├── hashing/
│   │   │   └── index.ts
│   │
│   ├── tailwind/
│   │   ├── src/
│   │   │   ├── directives/
│   │   │   ├── theme/
│   │   │   ├── utilities/
│   │   │   ├── variants/
│   │   │   ├── plugins/
│   │   │   └── index.ts
│   │
│   ├── css/
│   │   ├── src/
│   │   │   ├── parser/
│   │   │   ├── ast/
│   │   │   └── index.ts
│   │
│   ├── runtime/
│   │   ├── src/
│   │   │   ├── resolver/
│   │   │   ├── cache/
│   │   │   ├── className/
│   │   │   └── index.ts
│   │
│   ├── react-native/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── prop-mapping/
│   │   │   ├── style-lowering/
│   │   │   ├── capability/
│   │   │   └── index.ts
│   │
│   ├── react-native-fabric/
│   │   ├── src/
│   │   │   ├── shadow-tree/
│   │   │   ├── updates/
│   │   │   ├── batching/
│   │   │   └── index.ts
│   │
│   ├── reanimated/
│   │   ├── src/
│   │   │   ├── parser/
│   │   │   ├── transitions/
│   │   │   ├── keyframes/
│   │   │   ├── entering/
│   │   │   ├── exiting/
│   │   │   ├── layout/
│   │   │   └── index.ts
│   │
│   ├── react-native-web/
│   │   ├── src/
│   │   │   ├── css/
│   │   │   ├── class-generation/
│   │   │   └── index.ts
│   │
│   ├── metro/
│   ├── babel/
│   ├── cli/
│   ├── theme/
│   └── extension-sdk/
│
├── native/
│   ├── cpp/
│   ├── ios/
│   └── android/
│
├── examples/
│   ├── expo-sdk57/
│   ├── bare-rn/
│   ├── reanimated/
│   └── web/
│
├── benchmarks/
├── tests/
├── docs/
└── scripts/
```

## Package dependency direction

```text
                 core
                  ↑
        ir ← parser ← tailwind
        ↑       ↑       ↑
     compiler ← optimizer
        ↑
     backends
      /    \
 native    web
   /   \
Fabric Reanimated
   |
 JSI/Nitro
```

Forbidden dependency direction:

```text
Tailwind → Fabric       ❌
IR → React Native       ❌
Compiler → Nitro        ❌
Parser → Reanimated     ❌
Web backend → Fabric    ❌
Extension SDK → Tailwind ❌
```

## Extension SDK boundary

Status (2026-08-13, Phase 8): `packages/extension-sdk` exists with zero
dependencies — `defineUtility`/`defineVariant`/`defineTokens`/`definePreset`
return plain descriptors and `renderExtensions` lowers them to CSS text
(`docs/specs/EXTENSION_API_SPEC.md`). Dependency direction:
`@windforge/metro` depends on `@windforge/extension-sdk` (renders
descriptors to `extraCss` before compilation) while `@windforge/tailwind`
only receives the `extraCss` string and never depends on the SDK. The
custom frontend interface (`WindforgeFrontend`) lives in `@windforge/metro`
and imports `RuntimeArtifact` from `@windforge/tailwind`; the custom
backend interface (`setBackend`) lives in `@windforge/react-native`.

## Native package boundary

The native package should expose a narrow interface such as:

```ts
interface NativeStyleRuntime {
  registerStyle(style: CompiledStyle): StyleHandle;
  updateNode(handle: NodeHandle, update: NativeStyleUpdate): void;
  updateTheme(update: ThemeUpdate): void;
  getMetrics(): NativeMetrics;
}
```

The implementation may use C++, JSI or Nitro internally.

Note (Phase 7): a JS-side capability layer now exists —
`getMetrics()`/`useMetrics()` in `@windforge/react-native` (conditions +
optional insets store). The `getMetrics()` native method above stays
design-only until profiling demands it; the JS layer satisfies the metrics
capability without a protocol change.

## Reanimated boundary

```ts
interface AnimationBackend {
  compileTransition(input: TransitionIR): AnimationDescriptor;
  compileKeyframes(input: KeyframeIR): AnimationDescriptor;
  compileEntering(input: EnteringIR): AnimationDescriptor;
  compileExiting(input: ExitingIR): AnimationDescriptor;
  compileLayout(input: LayoutAnimationIR): AnimationDescriptor;
}
```

No `SharedValue` type should appear in the platform-independent IR.

Status (2026-08-13, Phase 6 P0): `packages/reanimated` exists with the
compile/bindings split this boundary describes — `src/compile.ts` is a pure
planner (`planKeyframes`/`planTransition`, easing descriptors instead of
Reanimated objects, no reanimated import) and only `components.tsx` /
`conditions.ts` touch Reanimated. `TransitionIR` is implemented in
`@windforge/ir`; `EnteringIR`, `ExitingIR`, and `LayoutAnimationIR` remain
design-only (P1 follow-up — see `docs/IMPLEMENTATION_ROADMAP.md` Phase 6).

## Component mapping

All standard RN components should have automatic mapping where their `style` prop can accept the lowered output.

Maintain an explicit registry:

```ts
registerComponent({
  component: View,
  styleProp: 'style',
  classNameProp: 'className',
  animatedComponent: Animated.View,
});
```

For special components:

```ts
contentContainerClassName
ListHeaderComponentClassName
ListFooterComponentClassName
columnWrapperClassName
```

support must be represented as prop mappings rather than hard-coded parser rules.

> Status (2026-08-13): `registerComponent`/`styled()`/`useWindforgeStyle()`
> implement this registry, with default mappings for ScrollView/SectionList
> (`contentContainerClassName`) and FlatList (`columnWrapperClassName`).
> `ListHeader`/`ListFooterComponentClassName` (element-valued props) and
> `animatedComponent` are deferred. See `docs/IMPLEMENTATION_ROADMAP.md` Phase 5.

## Metro

Metro should orchestrate transformation and dependency watching.

```text
Metro
 ├─ content discovery
 ├─ CSS input tracking
 ├─ Tailwind compilation
 ├─ JSX/className transform
 ├─ cache management
 └─ HMR invalidation
```

Semantic style resolution remains in the compiler.

## Babel

Babel support can exist for JSX transforms and compatibility, but the architecture should not require a Babel runtime parser. Static compilation should be performed through the build pipeline.

## Web

React Native Web should consume the same Style IR. Web lowering may generate deterministic CSS classes or compatible style representations.

Do not expose DOM/CSSOM objects from the core compiler.

## Testing layout

```text
tests/
├── parser/
├── compiler/
├── ir/
├── optimizer/
├── tailwind/
├── css/
├── react-native/
├── fabric/
├── reanimated/
├── web/
├── metro/
└── e2e/
```

## Benchmark layout

```text
benchmarks/
├── compile/
├── mount/
├── dynamic-class/
├── theme-switch/
├── reanimated/
├── shadow-tree/
├── memory/
└── web/
```
