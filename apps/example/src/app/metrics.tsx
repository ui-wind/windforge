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
 */
import { memo, useEffect, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { interpolateColor, useAnimatedStyle } from 'react-native-reanimated';
import {
  Text,
  View,
  getRuntimeDiagnostics,
  useMetrics,
  useWindforgeStyle,
} from '@windforge/react-native';
import { useAnimatedThemeProgress } from '@windforge/reanimated';

/** One row in the metrics panel. */
function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-zinc-800 py-1.5">
      <Text className="text-xs text-zinc-400 dark:text-zinc-500">{label}</Text>
      <Text className="text-xs font-medium text-zinc-100 dark:text-zinc-300">{value}</Text>
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
    backgroundColor: interpolateColor(progress.value, [0, 1], ['#f4f4f5', '#18181b']),
    borderColor: interpolateColor(progress.value, [0, 1], ['#a1a1aa', '#3f3f46']),
  }));
  return (
    <View className="mt-2 items-center gap-3">
      <Animated.View style={animatedStyle}>
        <Text className="text-xs font-semibold text-accent">light ↔ dark</Text>
      </Animated.View>
      <Text className="text-xs text-zinc-400 dark:text-zinc-500">
        React renders of the box: {renders.current} — flip dark mode to crossfade
      </Text>
    </View>
  );
});

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
    <View className="flex-1 bg-zinc-950 dark:bg-zinc-900">
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView style={mainStyle}>
          <Text className="text-2xl font-bold text-zinc-100 dark:text-zinc-300">Metrics</Text>
          <Text className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
            Live platform metrics, layout-direction variants, and the animated theme progress.
          </Text>

          {/* Metrics panel: live values from the capability layer. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-100 dark:text-zinc-300">
            Platform metrics (useMetrics)
          </Text>
          <View className="mt-2 rounded-lg bg-zinc-900 p-3 dark:bg-zinc-800">
            <MetricRow label="colorScheme" value={metrics.colorScheme} />
            <MetricRow label="platform" value={metrics.platform} />
            <MetricRow label="window" value={`${metrics.windowWidth}x${metrics.windowHeight}`} />
            <MetricRow label="fontScale" value={String(metrics.fontScale)} />
            <MetricRow label="pixelRatio" value={String(metrics.pixelRatio)} />
            <MetricRow label="layoutDirection" value={metrics.layoutDirection} />
            <MetricRow label="insets" value={fmtInsets(metrics.insets)} />
          </View>

          {/* Layout-direction variants: rtl: / ltr: swap color and text. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-100 dark:text-zinc-300">
            Layout-direction variants (rtl: / ltr:)
          </Text>
          <View className="mt-2 gap-2">
            <View className="rounded-lg bg-accent p-3 rtl:bg-emerald-500 ltr:bg-indigo-500">
              <Text className="text-sm font-semibold text-white">
                base accent · ltr:bg-indigo-500 · rtl:bg-emerald-500
              </Text>
            </View>
            <View className="rounded-lg bg-zinc-800 p-3 dark:bg-zinc-700">
              <Text className="text-sm text-zinc-200 rtl:text-emerald-300 ltr:text-indigo-300">
                direction-aware text color (currently {metrics.layoutDirection})
              </Text>
            </View>
          </View>

          {/* Theme transition: progress-driven crossfade. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-100 dark:text-zinc-300">
            Animated theme progress (useAnimatedThemeProgress)
          </Text>
          <ThemeTransitionBox />

          <Text className="mt-4 text-sm font-semibold text-zinc-100 dark:text-zinc-300">
            Runtime diagnostics
          </Text>
          <Text className="mt-2 text-xs text-zinc-500">{diagnostics}</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
