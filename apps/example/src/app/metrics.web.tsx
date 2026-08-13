/**
 * Web placeholder for the Metrics screen.
 *
 * The native screen (metrics.tsx) drives the platform-metrics capability
 * layer, layout-direction variants and the animated theme progress; the web
 * backend is out of scope for Phase 7, so the web bundle stays free of the
 * Reanimated dependency (same pattern as animation.web.tsx).
 */
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@windforge/react-native';

export default function MetricsScreenWeb() {
  return (
    <View className="flex-1 bg-zinc-100 dark:bg-zinc-950">
      <SafeAreaView style={{ flex: 1 }}>
        <Text className="p-6 text-sm text-zinc-600 dark:text-zinc-500">
          Metrics screen is native-only in Phase 7 — run the iOS simulator
          (docs/guides/NATIVE_SETUP_IOS.md).
        </Text>
      </SafeAreaView>
    </View>
  );
}
