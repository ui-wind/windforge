# Windforge Reference Study — Uniwind + NativeWind

## Purpose

This document defines what Windforge should learn from Uniwind and NativeWind without copying their implementation. The goal is feature parity at the product level while keeping Windforge's compiler, IR, and backend architecture independent.

## Sources

- Uniwind Pro documentation: https://docs.uniwind.dev/pro-version
- Uniwind compatibility: https://docs.uniwind.dev/pro/compatibility
- Uniwind Reanimated animations: https://docs.uniwind.dev/pro/reanimated-animations
- Uniwind CSS parser: https://docs.uniwind.dev/api/css
- Uniwind migration: https://docs.uniwind.dev/migration-from-nativewind
- Uniwind changelog: https://docs.uniwind.dev/pro/changelog
- Uniwind OSS repository: https://github.com/uni-stack/uniwind
- NativeWind documentation: https://www.nativewind.dev/docs
- NativeWind v5 documentation: https://www.nativewind.dev/v5
- NativeWind repository: https://github.com/nativewind/nativewind
- react-native-css-interop package: https://www.npmjs.com/package/react-native-css-interop

## Product-level lessons

### NativeWind

NativeWind demonstrates the value of treating Tailwind as the styling language while lowering it differently on web and native. Its current documentation describes build-time Tailwind compilation, a small runtime for reactive styles, CSS variables/custom values, dark mode, arbitrary classes, media/container queries, pseudo states, parent-state/group styling, custom CSS, animations/transitions, and React Native Web support.

Important architectural lesson:

```text
Tailwind language
      ↓
Build-time compiler
      ↓
Platform-aware representation
      ↓
Native runtime OR Web/CSS runtime
```

Windforge should preserve this separation, but replace the runtime hot path with a stronger compiled/Fabric-oriented architecture.

### Uniwind

Uniwind demonstrates a simpler Tailwind v4-first product model and a Metro-oriented compilation architecture. Its Pro layer adds a C++/Fabric-oriented runtime, ShadowTree updates, Reanimated 4 className animations, native theme transitions, group variants, and native safe-area/platform metrics.

Windforge should target these capabilities as open-source features rather than treating them as commercial-only capabilities.

## Feature parity target

The following is the target product surface. `NativeWind` and `Uniwind Pro` are references, not implementation dependencies.

| Capability | NativeWind | Uniwind Pro | Windforge target |
|---|---|---|---|
| Tailwind utilities | Yes | Yes | Yes |
| Tailwind v4 | v5 preview | Yes | Yes |
| className on RN components | Yes | Yes | Yes |
| Automatic RN prop mapping | Yes | Yes | Yes |
| Web / React Native Web | Yes | Yes | First-class |
| Dark mode | Yes | Yes | Yes |
| Custom themes/tokens | Yes | Yes | Yes |
| Platform variants | Yes | Yes | Yes |
| Responsive variants | Yes | Yes | Yes |
| Pseudo states | Yes | Yes | Yes |
| Group/parent state | Yes | Pro | Yes |
| Arbitrary values | Yes | Yes | Yes |
| CSS variables/custom values | Yes | Yes | Yes |
| Custom CSS | Yes | Yes | Yes |
| Media queries | Yes | Yes | Yes |
| Container queries | Yes | Yes/where supported | Yes with capability model |
| Plugins/extensions | Yes | Tailwind/plugin model | Yes + Windforge extension API |
| Static/build-time compilation | Yes | Yes | Mandatory |
| Runtime dynamic styles | Yes | Yes | Controlled fallback |
| Reanimated 4 className animations | Limited/current feature dependent | Pro | First-class |
| Keyframe animations | Yes/current | Pro | Yes |
| Entering animations by class | Not core parity target | Pro | Yes |
| Exiting animations by class | Not core parity target | Pro | Yes |
| Layout animations by class | Reanimated integration | Pro | Yes |
| Native theme transitions | No equivalent Pro engine | Pro | Yes |
| Zero React re-render native updates | No | Pro | Target |
| ShadowTree native updates | No | Pro | Target |
| Native safe-area/platform metrics | Via RN libraries/hooks | Pro | Target |
| Expo Go | Yes in supported free flow | Pro no | No requirement for native accelerated mode |
| New Architecture | Supported | Required by Pro | Required |

## Uniwind Pro feature backlog

Windforge should explicitly track these features:

1. C++ native style engine.
2. ShadowTree style updates that can bypass React renders.
3. Reanimated 4 className translation.
4. CSS/Tailwind keyframe animations.
5. `transition-*` class support.
6. entering/exiting/layout animation class support.
7. animated component auto-upgrade for common RN primitives.
8. native theme transitions.
9. native safe-area insets.
10. font scale and pixel ratio native metrics.
11. group interaction state propagation.
12. suspended subtree correctness.
13. P3 color parsing.
14. logical spacing such as start/end variants.
15. custom CSS parsing.
16. automatic className mapping for RN components.
17. platform selectors and responsive rules.
18. dev diagnostics for invalid color props/classes.
19. compatibility matrix for RN/Expo/Reanimated/Nitro.

## NativeWind feature backlog

Windforge should also track:

1. Tailwind compiler integration.
2. Tailwind v4 CSS-first configuration.
3. `@theme` tokens.
4. `@utility` custom utilities.
5. `@custom-variant` custom variants.
6. `@source` source discovery for monorepos.
7. `@plugin` support.
8. custom CSS.
9. CSS variables.
10. `calc()`/color functions where native lowering is valid.
11. safe-area environment values.
12. platform modifiers: `ios:`, `android:`, `web:`, `native:` and related supported targets.
13. hover/focus/active/disabled/empty states.
14. data attributes where supported by the platform.
15. parent/group variants.
16. rem and platform-aware unit handling.
17. media/container queries.
18. arbitrary classes/values.
19. third-party component prop remapping.
20. Metro configuration integration.
21. optional Babel/JSX transform integration.
22. development hot reload support.

## What Windforge should deliberately do differently

### 1. Stable intermediate representation

NativeWind and Uniwind can expose implementation-specific runtime representations. Windforge should make the IR a formal contract:

```text
Tailwind/CSS/custom syntax
          ↓
       Frontend
          ↓
      Style AST
          ↓
       Style IR
          ↓
     Optimizer
       ↙     ↘
 Native       Web
 backend      backend
```

### 2. Native acceleration is an adapter

JSI, Nitro, C++, Fabric and ShadowTree code must stay behind native backend interfaces. The compiler must not know which native binding mechanism is used.

### 3. Reanimated is represented explicitly

Static properties and animated properties must be distinguishable in the IR. Reanimated worklet data must not leak into the core parser or Tailwind frontend.

### 4. Web is not a fallback

Web and native share the same className language and IR, but use different lowering strategies.

## License / implementation rule

Windforge is inspired by publicly documented behavior and open-source projects. Do not copy proprietary implementation code, binaries, generated artifacts, or internal implementation details. Reimplement the behavior from public specifications and independently designed interfaces.
