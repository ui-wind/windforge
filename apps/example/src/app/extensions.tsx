/**
 * Extensions screen — Phase 8 (docs/IMPLEMENTATION_ROADMAP.md).
 *
 * Demos the Extension SDK end-to-end on a live device:
 *  - `defineUtility` (`glass`), `defineTokens` (brand color) and
 *    `defineVariant` (`land:` from `(orientation: landscape)`) — rendered to
 *    CSS text by @windforge/extension-sdk and injected into the Tailwind
 *    entry before compilation (apps/example/windforge.config.cjs);
 *  - a custom frontend: the example config hand-writes a small runtime
 *    artifact that registers after the Tailwind one — `card-pad` and
 *    `card-radius` below resolve from it;
 *  - the custom backend interface surface: the active backend name from
 *    `getBackend()` (fabric when native delivery is installed).
 */
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View, getBackend } from '@windforge/react-native';

export default function ExtensionsScreen() {
  return (
    <View className="flex-1 bg-zinc-100 dark:bg-zinc-950">
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView className="flex-1 p-6">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-300">Extensions</Text>
          <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-500">
            Extension SDK (defineUtility / defineTokens / defineVariant) and the custom frontend &
            backend interfaces.
          </Text>

          {/* Extension-defined classes, compiled through the Tailwind pipeline. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-300">
            Extension SDK (windforge.config.cjs)
          </Text>
          <View className="mt-2 gap-2">
            <View className="glass bg-brand land:bg-emerald-500 dark:bg-lime-500 rounded-lg p-4">
              <Text className="text-sm font-semibold text-white">
                glass · bg-brand · land:bg-emerald-500 · dark:bg-lime-500
              </Text>
            </View>
            <Text className="text-xs text-zinc-600 dark:text-zinc-500">
              glass = defineUtility (opacity: 0.8) — the box renders at 80% opacity. bg-brand =
              defineTokens (--color-brand: #22c55e; dark: flips to lime-500). land: = defineVariant
              on (orientation: landscape) — rotate the simulator to turn this box emerald.
            </Text>
          </View>

          {/* Classes resolved from the hand-written custom frontend artifact. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-300">
            Custom frontend artifact
          </Text>
          <View className="mt-2 gap-2">
            <View className="card-pad card-radius bg-indigo-500">
              <Text className="text-sm font-semibold text-white">card-pad · card-radius</Text>
            </View>
            <Text className="text-xs text-zinc-600 dark:text-zinc-500">
              Padding (20) and border radius (14) come from a hand-written RuntimeArtifact emitted
              by the example-handwritten frontend — registered after the Tailwind artifact, so
              later-wins override order applies.
            </Text>
          </View>

          {/* Custom backend interface surface. */}
          <Text className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-300">
            Backend
          </Text>
          <View className="mt-2 rounded-lg bg-white p-3 dark:bg-zinc-800">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-zinc-600 dark:text-zinc-500">getBackend().name</Text>
              <Text className="text-xs font-medium text-zinc-900 dark:text-zinc-300">
                {getBackend().name}
              </Text>
            </View>
            <Text className="mt-2 text-xs text-zinc-600 dark:text-zinc-500">
              setBackend(backend) installs a custom StyleBackend; it must be the last
              backend-affecting call before WindforgeProvider mounts.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
