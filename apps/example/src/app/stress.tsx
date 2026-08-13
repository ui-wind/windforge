/**
 * Stress screen for the native direct-commit path (Phase 4 kill criteria,
 * docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md).
 *
 * It keeps the renderer busy while appearance flips happen:
 *  - `tick` re-renders every 100ms so React commits land constantly
 *    (concurrent-commit criterion);
 *  - `churn` mounts/unmounts a styled section on its own timer
 *    (unmount-race criterion);
 *  - every box is className-styled with dark: variants, so a fast
 *    appearance flip (the simulator runbook in NATIVE_SETUP_IOS.md)
 *    exercises atomicity and convergence under the churn above.
 *
 * The live `getDiagnostics` panel shows the counters used as evidence:
 * directCommits climbs once per flip, bindings stay bounded, and nothing
 * grows without limit across a 60-flip loop.
 */
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, Text, View } from '@windforge/react-native';
import { getWindforgeStyleModule } from '@windforge/native';

export default function StressScreen() {
  const [tick, setTick] = useState(0);
  const [churn, setChurn] = useState(false);
  const [diagnostics, setDiagnostics] = useState('—');

  useEffect(() => {
    // React commit pressure: one re-render every 100ms.
    const reactCommit = setInterval(() => setTick((t) => t + 1), 100);
    // Mount/unmount churn of a styled section.
    const mountCycle = setInterval(() => setChurn((c) => !c), 400);
    return () => {
      clearInterval(reactCommit);
      clearInterval(mountCycle);
    };
  }, []);

  const refreshDiagnostics = () => {
    getWindforgeStyleModule()?.getDiagnostics((result) => {
      setDiagnostics(JSON.stringify(result, null, 2));
    });
  };

  useEffect(() => {
    refreshDiagnostics();
    // Keep the panel live: native tabs keep screens mounted, so navigating
    // away and back does not remount — without this the counters freeze at
    // mount-time values.
    const refresh = setInterval(refreshDiagnostics, 2000);
    return () => clearInterval(refresh);
  }, []);

  return (
    <View className="flex-1 bg-zinc-950 dark:bg-zinc-900">
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView className="flex-1 p-6">
          <Text className="text-2xl font-bold text-zinc-100 dark:text-zinc-300">Stress</Text>
          <Text className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
            React commits every 100ms + mount/unmount churn. Flip the simulator
            appearance while this runs; see docs/guides/NATIVE_SETUP_IOS.md.
          </Text>

          <View className="mt-4 rounded-lg bg-accent p-4">
            <Text className="text-sm font-semibold text-white">
              React commit tick: {tick}
            </Text>
          </View>

          {churn && (
            <View className="mt-3 rounded-lg bg-emerald-600 dark:bg-emerald-700 p-4">
              <Text className="text-sm font-semibold text-white">
                Mounted section — will unmount in a moment
              </Text>
            </View>
          )}

          <View className="mt-3 gap-2">
            <View className="rounded-lg bg-zinc-800 dark:bg-zinc-700 p-3">
              <Text className="text-sm text-zinc-200 dark:text-zinc-300">
                bg-zinc-800 dark:bg-zinc-700
              </Text>
            </View>
            <View className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-3">
              <Text className="text-sm text-zinc-900 dark:text-zinc-200">
                bg-zinc-100 dark:bg-zinc-800
              </Text>
            </View>
            <View className="rounded-lg bg-white dark:bg-zinc-950 p-3">
              <Text className="text-sm text-zinc-900 dark:text-zinc-100">
                bg-white dark:bg-zinc-950
              </Text>
            </View>
          </View>

          <Pressable
            className="mt-4 rounded-lg bg-accent px-6 py-3"
            onPress={refreshDiagnostics}>
            <Text className="text-center text-base font-semibold text-white">
              Refresh diagnostics
            </Text>
          </Pressable>

          <Text className="mt-4 font-mono text-xs text-zinc-500">{diagnostics}</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
