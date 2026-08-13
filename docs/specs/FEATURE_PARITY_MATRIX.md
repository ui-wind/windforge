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
| @utility | P1 | ✓ | ✓ | Extension API |
| @custom-variant | P1 | ✓ | ✓ | Variant compiler |
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
| safe-area env() | P1 | ✓ | ✓ | Native metrics backend |

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
| Native metrics | P1 | safe area/font scale/pixel ratio |
| Suspended subtree handling | P1 | Must be tested |

## Reanimated

| Feature | Priority | Notes |
|---|---:|---|
| Animated.View className | P0 | Reanimated 4 |
| animate-* | P0 | Tailwind animation classes |
| transition-* | P0 | Property transitions |
| arbitrary keyframes | P1 | Compiler → animation IR |
| entering classes | P1 | Reanimated entering builders |
| exiting classes | P1 | Reanimated exiting builders |
| layout classes | P1 | Reanimated layout transitions |
| auto Animated component upgrade | P1 | Common RN primitives |
| SharedValue integration | P1 | UI-thread path |
| worklet-safe style representation | P0 | No React render per frame |
| animated theme transition | P1 | Native/UI thread target |

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
| monorepo support | P0 | |
| cache inspection | P1 | |
| compiler debug mode | P1 | |
| generated IR inspection | P1 | |

## Extensibility

| Feature | Priority |
|---|---:|
| defineUtility | P0 |
| defineVariant | P0 |
| defineTokens | P0 |
| definePreset | P1 |
| defineFrontend | P1 |
| defineBackend | P1 |
| custom IR transforms | P1 |
| plugin lifecycle hooks | P1 |
| Flutter backend interface | P2 |
