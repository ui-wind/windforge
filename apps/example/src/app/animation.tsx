/**
 * Animation screen — Phase 6 P0 (docs/IMPLEMENTATION_ROADMAP.md).
 *
 * Class-driven animation on the UI thread via @windforge/reanimated:
 *  - `animate-spin` (Tailwind built-in, 1s linear infinite);
 *  - `animate-spin-slow` (custom @theme token from global.css, 3s spin);
 *  - `transition-all duration-500 ease-in-out` with a ternary class toggle —
 *    the render counter proves 1 React render per toggle and 0 per frame;
 *  - live FPS via `useFrameCallback` (~1s average window);
 *  - runtime diagnostics row (cache / fallback counters).
 *
 * Everything animates from the Windforge artifact: no useAnimatedStyle in
 * user code, one React render per class change.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  makeMutable,
  runOnJS,
  useFrameCallback,
  type FrameInfo,
} from 'react-native-reanimated';
import {
  Pressable,
  Text,
  View,
  cx,
  getRuntimeDiagnostics,
  useWindforgeStyle,
} from '@windforge/react-native';
import { AnimatedView } from '@windforge/reanimated';

/** Average FPS over a ~1s sliding window, measured on the UI thread.
 * The accumulator lives in a SharedValue (the callback runs on the UI
 * thread) and the result hops back via runOnJS. */
function useFps(): number {
  const [fps, setFps] = useState(0);
  const window = useRef(makeMutable({ frames: 0, ms: 0 })).current;
  useFrameCallback((frame: FrameInfo) => {
    window.value.frames += 1;
    window.value.ms += frame.timeSincePreviousFrame ?? 16.7;
    if (window.value.ms >= 1000) {
      runOnJS(setFps)(Math.round((window.value.frames * 1000) / window.value.ms));
      window.value.frames = 0;
      window.value.ms = 0;
    }
  });
  return fps;
}

/**
 * Transition box: className swaps between two literals (both scanned at build
 * time — Phase 5 ternary pattern). The counter increments once per React
 * render of this component and must stay still while frames animate.
 * memo() keeps it exact: parent re-renders from the diagnostics ticker must
 * not count as renders of the box.
 */
const TransitionBox = memo(function TransitionBox({ active }: { active: boolean }) {
  const renders = useRef(0);
  renders.current += 1;
  return (
    <View className="mt-2 items-center gap-3">
      <AnimatedView
        className={cx(
          'rounded-xl transition-all duration-500 ease-in-out',
          active ? 'h-32 w-32 bg-accent' : 'h-20 w-20 bg-zinc-700',
        )}
      />
      <Text className="text-xs text-zinc-400 dark:text-zinc-500">
        React renders of the box: {renders.current} — 1 per toggle, 0 per frame
      </Text>
    </View>
  );
});

export default function AnimationScreen() {
  const [active, setActive] = useState(false);
  const [diagnostics, setDiagnostics] = useState('—');
  const fps = useFps();

  // useWindforgeStyle feeds the plain RN ScrollView (secondary surface, same
  // pattern as the Dynamic screen).
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
          <Text className="text-2xl font-bold text-zinc-100 dark:text-zinc-300">Animation</Text>
          <Text className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
            Class-driven keyframes and transitions on the UI thread.
          </Text>

          {/* Keyframes: Tailwind built-in animate-spin (1s linear infinite). */}
          <Text className="mt-4 text-sm font-semibold text-zinc-100 dark:text-zinc-300">
            animate-spin (built-in, 1s)
          </Text>
          <View className="mt-2 items-center">
            <AnimatedView className="h-16 w-16 rounded-lg bg-accent animate-spin" />
          </View>

          {/* Keyframes: custom @theme token --animate-spin-slow (3s). */}
          <Text className="mt-4 text-sm font-semibold text-zinc-100 dark:text-zinc-300">
            animate-spin-slow (custom @theme token, 3s)
          </Text>
          <View className="mt-2 items-center">
            <AnimatedView className="h-16 w-16 rounded-lg bg-emerald-500 animate-spin-slow" />
          </View>

          {/* Transitions: ternary class toggle — size and color interpolate. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-100 dark:text-zinc-300">
            transition-all duration-500 ease-in-out
          </Text>
          <Pressable
            className="mt-2 rounded-lg bg-zinc-800 dark:bg-zinc-700"
            onPress={() => setActive((a) => !a)}>
            <Text className="p-3 text-center text-sm font-semibold text-white">
              {active ? 'active — tap to shrink' : 'idle — tap to grow'}
            </Text>
          </Pressable>
          <TransitionBox active={active} />

          {/* Live measurements (Rule 11: performance claims need numbers). */}
          <Text className="mt-4 text-sm font-semibold text-zinc-100 dark:text-zinc-300">
            Measurements
          </Text>
          <Text className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
            FPS (useFrameCallback, ~1s window): {fps}
          </Text>

          <Text className="mt-4 text-sm font-semibold text-zinc-100 dark:text-zinc-300">
            Runtime diagnostics
          </Text>
          <Text className="mt-2 text-xs text-zinc-500">{diagnostics}</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
