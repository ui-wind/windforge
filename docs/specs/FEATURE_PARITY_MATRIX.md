# Windforge Feature Parity Matrix

Legend:

- `P0` = required for the first serious release
- `P1` = required after the core is stable
- `P2` = extension/future
- `RN` = native React Native
- `WEB` = React Native Web

## Tailwind / styling

| Feature | Priority | RN | WEB | Notes |
|---|---:|:---:|:---:|---|
| className | P0 | ✓ | ✓ | Core API |
| Tailwind v4 utilities | P0 | ✓ | ✓ | Shared frontend |
| @theme | P0 | ✓ | ✓ | Token IR |
| @utility | P1 | ✓ | ✓ | Extension API (Phase 8: `defineUtility` authoring) |
| @custom-variant | P1 | ✓ | ✓ | Variant compiler (Phase 8: `defineVariant` authoring) |
| @source | P0 | ✓ | ✓ | Monorepo/content discovery |
| @plugin | P1 | ✓ | ✓ | Isolated plugin adapter |
| arbitrary values | P0 | ✓ | ✓ | Capability checked |
| arbitrary properties | P1 | ✓ | ✓ | Where representable |
| CSS variables | P0 | ✓ | ✓ | Static + controlled dynamic |
| custom CSS | P1 | ✓ | ✓ | CSS → same IR |
| dark mode | P0 | ✓ | ✓ | System/class strategy |
| platform variants | P0 | ✓ | ✓ | ios/android/web/native |
| responsive variants | P0 | ✓ | ✓ | Native and web lowering differ |
| pseudo states | P0 | ✓ | ✓ | Component capability dependent |
| group variants | P0 | ✓ | ✓ | Native propagation target |
| data attributes | P1 | capability | ✓ | RNW semantics where available |
| media queries | P1 | capability | ✓ | Backend-specific |
| container queries | P1 | capability | ✓ | Explicit capability model |
| rem | P0 | ✓ | ✓ | Platform-aware conversion |
| calc() | P1 | capability | ✓ | Native unit restrictions |
| color functions | P1 | capability | ✓ | Native parser required |
| safe-area env() | P1 | ✓ | ✓ | Phase 7: insets metrics API (`getInsets`/`useInsets`, optional `@windforge/react-native/safe-area` entrypoint); `env()` CSS lowering = follow-up |

## React Native runtime

| Feature | Priority | Notes |
|---|---:|---|
| Automatic className mapping | P0 | All standard RN components (Phase 5: styled()/prop mapping for third-party) |
| Static StyleSheet lowering | P0 | Fast baseline |
| Shared immutable style cache | P0 | Deduplicate styles (Phase 5: composed-string flyweight identity) |
| Dynamic class lookup | P0 | Generated tables first (Phase 5) |
| Runtime class fallback | P1 | Controlled and cached (Phase 5: parseStaticUtility) |
| Fabric backend | P0 | New Architecture only |
| ShadowTree updates | P1 | Native update path |
| Native style cache | P1 | C++/native if benchmarked |
| JSI backend | P1 | Narrow interface |
| Nitro adapter | P1 | Optional implementation backend |
| Native metrics | P1 | Phase 7: JS capability layer — `getMetrics`/`useMetrics` (colorScheme/platform/window/fontScale/pixelRatio/layoutDirection/insets), `rtl:`/`ltr:` variants; native `getMetrics()` stays design-only |
| Suspended subtree handling | P1 | Must be tested |

## Reanimated

| Feature | Priority | Notes |
|---|---:|---|
| Animated.View className | P0 | Reanimated 4 (Phase 6: AnimatedView/Text/Image/Pressable from @windforge/reanimated) |
| animate-* | P0 | Tailwind animation classes (Phase 6: AnimationIR + keyframes lowering, build path only) |
| transition-* | P0 | Property transitions (Phase 6: TransitionIR + planTransition) |
| arbitrary keyframes | P1 | Compiler → animation IR |
| entering classes | P1 | Reanimated entering builders (Phase 6 follow-up) |
| exiting classes | P1 | Reanimated exiting builders (Phase 6 follow-up) |
| layout classes | P1 | Reanimated layout transitions (Phase 6 follow-up) |
| auto Animated component upgrade | P1 | Common RN primitives |
| SharedValue integration | P1 | UI-thread path (Phase 6: useAnimatedConditionState mirror; deep binding into style resolution deferred) |
| worklet-safe style representation | P0 | No React render per frame (Phase 6: measured 1 render per toggle, 0 per frame; SV snapshot vs. reanimated #5430 freeze) |
| animated theme transition | P1 | Phase 7: `useAnimatedThemeProgress` SharedValue 0↔1 + `interpolateColor` on the UI thread (render counter 1 during flips); auto-animate of `dark:` variants = follow-up |

## Web

| Feature | Priority | Notes |
|---|---:|---|
| React Native Web | P0 | Same className API |
| deterministic CSS generation | P0 | Cache/reuse |
| SSR-safe output | P1 | No runtime stylesheet injection when avoidable |
| media queries | P0 | CSS lowering |
| hover/focus/active | P0 | Native web events/CSS |
| container queries | P1 | CSS lowering |
| CSS variables | P0 | Native CSS variables |
| responsive breakpoints | P0 | CSS media queries |

## Developer experience

| Feature | Priority | Notes |
|---|---:|---|
| Metro plugin | P0 | |
| CLI | P0 | |
| diagnostics | P0 | Phase 5: runtime counters + WF2001/WF2002 warn-once |
| IntelliSense metadata | P1 | |
| source maps | P1 | |
| HMR | P0 | |
| monorepo support | P0 | ✅ Phase 9: pnpm+turbo workspace; CI runs build/typecheck/test across all packages (`.github/workflows/ci.yml`) |
| cache inspection | P1 | |
| compiler debug mode | P1 | |
| generated IR inspection | P1 | |

## Extensibility

| Feature | Priority | Notes |
|---|---:|---|
| defineUtility | P0 | ✅ Phase 8: `@windforge/extension-sdk`, CSS-text lowering (`@utility`) |
| defineVariant | P0 | ✅ Phase 8: `@custom-variant`; media limited to the five evaluable condition kinds |
| defineTokens | P0 | ✅ Phase 8: `@theme` namespaces (colors/animate/spacing/radius/fontFamily/fontSize) |
| definePreset | P1 | ✅ Phase 8: aggregates utilities/variants/tokens + raw CSS |
| defineFrontend | P1 | ✅ Phase 8: `WindforgeFrontend` in `@windforge/metro`, WF3010 validation, later-registration-wins override |
| defineBackend | P1 | ✅ Phase 8: `setBackend` in `@windforge/react-native` with the ordering contract |
| custom IR transforms | P1 | |
| plugin lifecycle hooks | P1 | |
| `@plugin` JS plugin adapter | P1 | Tailwind row above; distinct from the descriptor surface |
| Flutter backend interface | P2 | Phase 10 research |
