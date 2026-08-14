/**
 * Metrics screen — Phase 7 (docs/IMPLEMENTATION_ROADMAP.md).
 *
 * Surfaces the platform-metrics capability layer on a live device:
 *  - `useMetrics()` panel — colorScheme, window dims, fontScale, pixelRatio,
 *    layoutDirection and (via WindforgeSafeAreaProvider) the four safe-area
 *    insets;
 *  - an `rtl:` / `ltr:` variant box whose color and text swap with the layout
 *    direction (Windforge @custom-variant media convention);
 *  - a theme-transition crossfade driven by `useAnimatedThemeProgress` +
 *    `interpolateColor` inside `useAnimatedStyle` — flip dark mode in the
 *    simulator to watch the box blend 0 (light) ↔ 1 (dark) on the UI thread,
 *    with a render counter proving 0 React renders per frame;
 *  - runtime diagnostics row.
 *
 * The screen is deliberately light-first (dark palette behind `dark:`
 * variants): light mode renders pale backgrounds so a dark-mode flip is a
 * visibly dramatic change — this is the screen that demos the theme
 * transition.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { interpolateColor, useAnimatedStyle } from 'react-native-reanimated';
import {
  LayoutDirection,
  Text,
  View,
  getCSSVariable,
  getRuntimeDiagnostics,
  useMetrics,
  useWindforgeStyle,
} from '@windforge/react-native';
import { useAnimatedThemeProgress } from '@windforge/reanimated';

/** One row in the metrics panel. */
function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-zinc-200 py-1.5 dark:border-zinc-800">
      <Text className="text-xs text-zinc-600 dark:text-zinc-500">{label}</Text>
      <Text className="text-xs font-medium text-zinc-900 dark:text-zinc-300">{value}</Text>
    </View>
  );
}

function fmtInsets(insets: { top: number; right: number; bottom: number; left: number } | null) {
  if (!insets) return 'null (bridge not mounted)';
  return `t:${insets.top} r:${insets.right} b:${insets.bottom} l:${insets.left}`;
}

/**
 * Theme-transition crossfade. `useAnimatedThemeProgress` animates a
 * SharedValue 0 (light) → 1 (dark) whenever the color scheme flips; the
 * color is interpolated on the UI thread, so the box never re-renders while
 * frames animate. memo() keeps the render counter exact.
 */
const ThemeTransitionBox = memo(function ThemeTransitionBox() {
  const renders = useRef(0);
  renders.current += 1;
  const progress = useAnimatedThemeProgress();
  const animatedStyle = useAnimatedStyle(() => ({
    width: 112,
    height: 112,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: interpolateColor(progress.value, [0, 1], ['#ffffff', '#18181b']),
    borderColor: interpolateColor(progress.value, [0, 1], ['#a1a1aa', '#3f3f46']),
  }));
  return (
    <View className="mt-2 items-center gap-3">
      <Animated.View style={animatedStyle}>
        <Text className="text-xs font-semibold text-accent">light ↔ dark</Text>
      </Animated.View>
      <Text className="text-xs text-zinc-600 dark:text-zinc-500">
        React renders of the box: {renders.current} — flip dark mode to crossfade
      </Text>
    </View>
  );
});

/**
 * Phase 15 — demonstrates `getCSSVariable(name)` outside a React render.
 * Reads the artifact theme table directly on tap, proving the non-hook path
 * works in event handlers (where useCSSVariable cannot be called).
 */
function GetCSSVariableDemo() {
  const [value, setValue] = useState<string | undefined>();
  const [reads, setReads] = useState(0);
  return (
    <View className="mt-2 gap-2">
      <Pressable
        className="rounded-lg bg-zinc-200 p-3 active:bg-zinc-300 dark:bg-zinc-700 dark:active:bg-zinc-600"
        onPress={() => {
          setValue(getCSSVariable('--color-accent'));
          setReads((n) => n + 1);
        }}
      >
        <Text className="text-sm text-zinc-700 dark:text-zinc-300">
          Tap to read --color-accent via getCSSVariable()
        </Text>
      </Pressable>
      <Text className="text-xs text-zinc-600 dark:text-zinc-500">
        {reads === 0 ? 'Not yet read' : `Read ${reads}x → ${value ?? '(undefined)'}`}
      </Text>
    </View>
  );
}

export default function MetricsScreen() {
  const metrics = useMetrics();
  const [diagnostics, setDiagnostics] = useState('—');

  // Feed the plain RN ScrollView via useWindforgeStyle (secondary surface).
  const mainStyle = useWindforgeStyle('flex-1 p-6');

  useEffect(() => {
    const refresh = () => {
      const d = getRuntimeDiagnostics();
      setDiagnostics(
        JSON.stringify(
          {
            resolves: d.resolves,
            cacheHits: d.cacheHits,
            cacheMisses: d.cacheMisses,
            fallbackParses: d.fallbackParses,
            unknownTokens: d.unknownTokens,
          },
          null,
          2,
        ),
      );
    };
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View className="flex-1 bg-zinc-100 dark:bg-zinc-950">
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView style={mainStyle}>
          <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-300">Metrics</Text>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-500">
            Live platform metrics, layout-direction variants, and the animated theme progress.
          </Text>

          {/* Metrics panel: live values from the capability layer. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-300">
            Platform metrics (useMetrics)
          </Text>
          <View className="mt-2 rounded-lg bg-white p-3 dark:bg-zinc-800">
            <MetricRow label="colorScheme" value={metrics.colorScheme} />
            <MetricRow label="platform" value={metrics.platform} />
            <MetricRow label="window" value={`${metrics.windowWidth}x${metrics.windowHeight}`} />
            <MetricRow label="fontScale" value={String(metrics.fontScale)} />
            <MetricRow label="pixelRatio" value={String(metrics.pixelRatio)} />
            <MetricRow label="layoutDirection" value={metrics.layoutDirection} />
            <MetricRow label="insets" value={fmtInsets(metrics.insets)} />
          </View>

          {/* Layout-direction variants: rtl: / ltr: swap color and text. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-300">
            Layout-direction variants (rtl: / ltr:)
          </Text>
          <View className="mt-2 gap-2">
            <View className="rounded-lg bg-accent p-3 rtl:bg-emerald-500 ltr:bg-indigo-500">
              <Text className="text-sm font-semibold text-white">
                base accent · ltr:bg-indigo-500 · rtl:bg-emerald-500
              </Text>
            </View>
            <View className="rounded-lg bg-zinc-200 p-3 dark:bg-zinc-700">
              <Text className="text-sm text-zinc-700 dark:text-zinc-300 ltr:text-indigo-600 rtl:text-emerald-600 dark:ltr:text-indigo-300 dark:rtl:text-emerald-300">
                direction-aware text color (currently {metrics.layoutDirection})
              </Text>
            </View>
          </View>

          {/* Theme transition: progress-driven crossfade. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-300">
            Animated theme progress (useAnimatedThemeProgress)
          </Text>
          <ThemeTransitionBox />

          {/* Phase 15 — LayoutDirection subtree override. The inner subtree forces
              RTL regardless of device direction; rtl:/ltr: variants activate
              accordingly inside the subtree. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-300">
            LayoutDirection subtree override (Phase 15)
          </Text>
          <View className="mt-2 gap-2">
            <View className="rounded-lg bg-zinc-200 p-3 dark:bg-zinc-700">
              <Text className="text-xs text-zinc-600 dark:text-zinc-400">
                Device direction: {metrics.layoutDirection}
              </Text>
            </View>
            <LayoutDirection direction="rtl">
              <View className="rounded-lg bg-emerald-500 p-3 rtl:bg-indigo-500 ltr:bg-emerald-500">
                <Text className="text-sm font-semibold text-white">
                  Forced RTL subtree · shows indigo via rtl: variant
                </Text>
              </View>
            </LayoutDirection>
            <LayoutDirection direction="ltr">
              <View className="rounded-lg bg-indigo-500 p-3 rtl:bg-emerald-500 ltr:bg-indigo-500">
                <Text className="text-sm font-semibold text-white">
                  Forced LTR subtree · stays indigo via ltr: variant
                </Text>
              </View>
            </LayoutDirection>
          </View>

          {/* Phase 15 — getCSSVariable outside React. Tap to read --color-accent
              from the artifact theme table without a hook. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-300">
            getCSSVariable (non-hook, Phase 15)
          </Text>
          <GetCSSVariableDemo />

          {/* Phase 16 — border-inline-start/end lowering. border-s/border-e
              utilities map to RN's native logical border properties. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-300">
            Logical borders (border-s/border-e, Phase 16)
          </Text>
          <View className="mt-2 gap-2">
            <View className="rounded-lg bg-white p-3 border-s-4 border-s-indigo-500 dark:bg-zinc-800">
              <Text className="text-sm text-zinc-700 dark:text-zinc-300">
                border-s-4 border-s-indigo-500 (left in LTR, right in RTL)
              </Text>
            </View>
            <View className="rounded-lg bg-white p-3 border-e-4 border-e-emerald-500 dark:bg-zinc-800">
              <Text className="text-sm text-zinc-700 dark:text-zinc-300">
                border-e-4 border-e-emerald-500 (right in LTR, left in RTL)
              </Text>
            </View>
          </View>

          {/* Phase 15 — safe-area RTL utilities. ps-safe / pe-safe apply padding
              that swaps between left/right insets when direction flips. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-300">
            Safe-area RTL utilities (ps-safe / pe-safe, Phase 15)
          </Text>
          <View className="mt-2 rounded-lg border border-zinc-300 bg-white ps-safe pe-safe py-3 dark:border-zinc-700 dark:bg-zinc-800">
            <Text className="text-sm text-zinc-700 dark:text-zinc-300">
              ps-safe + pe-safe padding (device direction: {metrics.layoutDirection})
            </Text>
          </View>

          <Text className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-300">
            Runtime diagnostics
          </Text>
          <Text className="mt-2 text-xs text-zinc-600 dark:text-zinc-500">{diagnostics}</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
