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
| @source | P0 | ✓ | ✓ | ✅ Phase 10: `compiler.sources` — official Tailwind auto-detect + `@source` + `.gitignore` |
| @plugin | P1 | ✓ | ✓ | Isolated plugin adapter |
| arbitrary values | P0 | ✓ | ✓ | Capability checked; ✅ Phase 15: `!important` modifier supported (two-tier merge, important declarations override non-important regardless of token order) |
| arbitrary properties | P1 | ✓ | ✓ | Where representable |
| CSS variables | P0 | ✓ | ✓ | ✅ Phase 12: static + controlled dynamic + scoped (ScopedVariables nearest-wins); `useCSSVariable` reads cascade; `updateCSSVariables` writes per-theme overrides; ✅ Phase 15: `getCSSVariable(name)` non-hook reader for event handlers/async callbacks |
| named themes | P1 | ✓ | ✓ | ✅ Phase 12: `extraThemes` injects `@custom-variant`; artifact v2 `themes` field; ThemeStore (`setTheme`/`useWindforgeTheme`); ScopedTheme subtree override; theme-variant utilities (`sunset:`/`ocean:`) activate per current theme |
| custom CSS | P1 | ✓ | ✓ | CSS → same IR |
| dark mode | P0 | ✓ | ✓ | System/class strategy |
| platform variants | P0 | ✓ | ✓ | ios/android/web/native |
| responsive variants | P0 | ✓ | ✓ | Native and web lowering differ |
| pseudo states | P0 | ✓ | ✓ | ✅ Phase 11: `active:`/`hover:`/`focus:`/`disabled:` lowered to condition kind `state`; Pressable captures press/hover, TextInput captures focus; two-tier specificity merge (variant declarations outrank base utilities) |
| group variants | P0 | ✓ | ✓ | ✅ Phase 11: `group`/`group/<name>` → context-based nearest-wins propagation via GroupContext provider; named groups scoped by groupName |
| data attributes | P1 | capability | ✓ | ✅ Phase 11: `data-[attr=value]:` lowered to condition kind `data`; `data-*` props feed ComponentState.data slot and are stripped from host element |
| media queries | P1 | capability | ✓ | Backend-specific |
| container queries | P1 | capability | ✓ | Explicit capability model |
| rem | P0 | ✓ | ✓ | Platform-aware conversion |
| calc() | P1 | ✓ | ✓ | ✅ Phase 15: min()/max()/clamp() statically evaluated when arguments share a unit family (all px, or all percent); mixed units require runtime reference lengths and emit WF1002/WF1005 |
| logical borders (border-s/border-e) | P1 | ✓ | ✓ | ✅ Phase 16: border-inline-start/end width/color/style lowered to RN's native `borderInlineStartWidth`/`borderInlineEndWidth` etc.; `border-s-*` and `border-e-*` utilities work correctly with zero WF1003 diagnostics |
| color functions | P1 | capability | ✓ | Native parser required |
| safe-area env() | P1 | ✓ | ✓ | ✅ Phase 7: insets metrics API (`getInsets`/`useInsets`, optional `@windforge/react-native/safe-area` entrypoint); ✅ Phase 15: RTL-safe utilities (`ps-safe`/`pe-safe`/`ms-safe`/`me-safe`/`start-safe`/`end-safe`) with nested `@media (layout-direction: rtl)` in builtin @utility definitions; runtime resolution via insets store + registry version bump |

## React Native runtime

| Feature | Priority | Notes |
|---|---:|---|
| Automatic className mapping | P0 | All standard RN components (Phase 5: styled()/prop mapping for third-party); ✅ Phase 15: `withWindforge(Component)` HOC alias of styled() |
| Static StyleSheet lowering | P0 | Fast baseline |
| Shared immutable style cache | P0 | Deduplicate styles (Phase 5: composed-string flyweight identity) |
| Dynamic class lookup | P0 | Generated tables first (Phase 5) |
| Runtime class fallback | P1 | Controlled and cached (Phase 5: parseStaticUtility) |
| Fabric backend | P0 | New Architecture only |
| ShadowTree updates | P1 | Native update path |
| Native style cache | P1 | C++/native if benchmarked |
| JSI backend | P1 | Narrow interface |
| Nitro adapter | P1 | Optional implementation backend |
| Native metrics | P1 | Phase 7: JS capability layer — `getMetrics`/`useMetrics` (colorScheme/platform/window/fontScale/pixelRatio/layoutDirection/insets), `rtl:`/`ltr:` variants; native `getMetrics()` stays design-only; ✅ Phase 15: `LayoutDirection` component overrides direction per subtree via context; nearest-wins with device fallback |
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
| deterministic CSS generation | P0 | ✅ Phase 13: `generate({ platform: 'web' })` produces identical CSS across builds |
| SSR-safe output | P1 | ✅ Phase 13: no runtime stylesheet injection; CSS emitted at build time; ✅ Phase 15: unresolved CSS variables during SSR fail silently (no throw); `initialThemes` prop detects SSR-rendered theme class on `<html>` to prevent flicker |
| media queries | P0 | ✅ Phase 13: pure CSS lowering via Tailwind compiler |
| hover/focus/active | P0 | ✅ Phase 13: web-css backend returns `{ className }`; browser evaluates pseudo-selectors in emitted CSS |
| container queries | P1 | CSS lowering |
| CSS variables | P0 | Native CSS variables |
| responsive breakpoints | P0 | ✅ Phase 13: pure CSS media queries in emitted stylesheet |
| CSS-first backend (Vite) | P0 | ✅ Phase 13: `@windforge/vite` plugin serves compiled CSS as virtual module; zero JS overhead for styling on web |
| Metro web platform-split | P0 | ✅ Phase 13: `compileWindforge({ platform: 'web' })` emits native IR + web CSS artifacts; resolver routes by platform |
| Vite plugin | P0 | ✅ Phase 13: `@windforge/vite` with virtual modules, cached compilation, HMR support |

## Developer experience

| Feature | Priority | Notes |
|---|---:|---|
| Metro plugin | P0 | ✅ Phase 10: `@windforge/metro` verified on Expo (`apps/example`) and bare RN CLI (`apps/bare`); `MetroConfigLike` keeps it Expo-agnostic |
| CLI | P0 | |
| diagnostics | P0 | Phase 5: runtime counters + WF2001/WF2002 warn-once; ✅ Phase 15: `useResolveClassNames(className)` hook alias of `useWindforgeStyle` for explicit className→style resolution |
| IntelliSense metadata | P1 | |
| source maps | P1 | |
| HMR | P0 | ✅ Phase 10: file watcher regenerates `.windforge/generated.js` inside the project root; Metro invalidates without restart (no Metro-internals patching) |
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
| Flutter backend interface | P2 | Phase 14 research |
