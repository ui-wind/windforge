/**
 * Dynamic screen — Phase 5 dynamic-runtime demo (docs/IMPLEMENTATION_ROADMAP.md).
 *
 * Build-time resolution stays primary (Home tab). This screen exercises the
 * dynamic surface that build-time extraction cannot reach:
 *  - ternary / cx() conditional class expressions (string literals — picked up
 *    at build time, resolved from the artifact at runtime);
 *  - a template-literal stepper `p-${n}` whose multipliers (5/7/9) never appear
 *    as literals — resolved by the controlled fallback parser (WF2002);
 *  - styled() on a third-party-shaped component and useWindforgeStyle() feeding
 *    a plain RN ScrollView's contentContainerStyle (prop mapping);
 *  - a live diagnostics panel showing fallbackParses climb and an intentionally
 *    unknown token (`rotate-45`, WF2001).
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  ScrollView,
  View as RNView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Pressable,
  Text,
  View,
  cx,
  getRuntimeDiagnostics,
  styled,
  useWindforgeStyle,
} from '@windforge/react-native';

// A third-party-shaped component: accepts a style prop but no className.
function Badge({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return <RNView style={style}>{children}</RNView>;
}
// styled() adds className support via the default className→style mapping.
const StyledBadge = styled<{ style?: StyleProp<ViewStyle>; children?: ReactNode }>(Badge);

const STEPS = [5, 7, 9] as const;

export default function DynamicScreen() {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [diagnostics, setDiagnostics] = useState('—');

  const n = STEPS[stepIndex % STEPS.length];
  // `p-${n}` (n ∈ 5/7/9) never appears as a literal in source, so the
  // artifact has no entry — the fallback parser resolves it (n × 4 points).
  const stepperClass = `p-${n}`;

  // Plain RN component + hook: useWindforgeStyle resolves a className string
  // to a style object. It feeds both this screen's main ScrollView and the
  // horizontal one's contentContainerStyle (a non-linkable secondary surface).
  const mainStyle = useWindforgeStyle('flex-1 p-6');
  const contentStyle = useWindforgeStyle('gap-3 p-3');

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
            fallbackMisses: d.fallbackMisses,
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
          <Text className="text-2xl font-bold text-zinc-100 dark:text-zinc-300">Dynamic</Text>
          <Text className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
            Conditional classes, runtime lookup, and the controlled fallback parser.
          </Text>

          {/* Ternary: both branches are string literals, so the build resolves
              them into the artifact; runtime just selects one. */}
          <Pressable
            className={cx('mt-4 rounded-lg', active ? 'bg-accent' : 'bg-zinc-800')}
            onPress={() => setActive((a) => !a)}>
            <Text className="p-4 text-center text-sm font-semibold text-white">
              {active ? 'active → bg-accent' : 'idle → bg-zinc-800'} (tap to toggle)
            </Text>
          </Pressable>

          {/* cx() with object conditions — same artifact-backed literals. */}
          <View
            className={cx('mt-3 rounded-lg bg-zinc-800', {
              'bg-accent': active,
            })}>
            <Text className="p-3 text-sm text-white">cx() with object condition</Text>
          </View>

          {/* Stepper: `p-${n}` is a template literal, so the multiplier is not a
              build-time literal. n ∈ 5/7/9 → fallback parser (n × 4 points). */}
          <View className="mt-3 rounded-lg bg-zinc-800 dark:bg-zinc-800 p-3">
            <Text className="text-sm font-semibold text-white">Fallback stepper</Text>
            <Text className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              {'className={`p-${n}`} — n is never a source literal.'}
            </Text>
            {/* flexDirection comes through the inline style escape hatch: the
                Windforge View still resolves className and merges the two. */}
            <View className="mt-2 gap-2" style={{ flexDirection: 'row' }}>
              <Pressable
                className="rounded-lg bg-zinc-700 p-3"
                onPress={() => setStepIndex((i) => (i + STEPS.length - 1) % STEPS.length)}>
                <Text className="text-sm text-white">−</Text>
              </Pressable>
              <View className={cx('rounded-lg bg-emerald-600', stepperClass)}>
                <Text className="text-sm font-semibold text-white">
                  {stepperClass} = {n * 4}pt
                </Text>
              </View>
              <Pressable
                className="rounded-lg bg-zinc-700 p-3"
                onPress={() => setStepIndex((i) => (i + 1) % STEPS.length)}>
                <Text className="text-sm text-white">+</Text>
              </Pressable>
            </View>
          </View>

          {/* styled() on a third-party-shaped component (default mapping). */}
          <StyledBadge className="mt-3 rounded-lg bg-accent p-4">
            <Text className="text-sm font-semibold text-white">
              styled(Badge) — custom component via prop mapping
            </Text>
          </StyledBadge>

          {/* Plain RN ScrollView + useWindforgeStyle → contentContainerStyle.
              The hook output (gap-3 p-3) feeds a secondary style surface that
              the native protocol cannot bind directly. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-100 dark:text-zinc-300">
            useWindforgeStyle → contentContainerStyle
          </Text>
          <ScrollView
            horizontal
            contentContainerStyle={contentStyle}
            style={{ height: 64 }}>
            <RNView style={{ borderRadius: 8, backgroundColor: '#047857', padding: 12 }}>
              <Text style={{ color: '#fff', fontSize: 13 }}>item A</Text>
            </RNView>
            <RNView style={{ borderRadius: 8, backgroundColor: '#047857', padding: 12 }}>
              <Text style={{ color: '#fff', fontSize: 13 }}>item B</Text>
            </RNView>
          </ScrollView>

          {/* Unknown token on purpose → WF2001 diagnostic. */}
          <View className="mt-3 rounded-lg bg-zinc-800 dark:bg-zinc-800 p-3 rotate-45">
            <Text className="text-xs text-zinc-400 dark:text-zinc-500">
              rotate-45 is intentionally unsupported → appears in unknownTokens.
            </Text>
          </View>

          {/* Live diagnostics panel. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-100 dark:text-zinc-300">
            Runtime diagnostics
          </Text>
          <Text className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            fallbackParses should climb as you tap the stepper.
          </Text>
          <Text className="mt-2 text-xs text-zinc-500">{diagnostics}</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
