/**
 * Web placeholder for the Metrics screen.
 *
 * The native screen (metrics.tsx) drives the platform-metrics capability
 * layer, layout-direction variants and the animated theme progress; the web
 * backend is out of scope for Phase 7, so the web bundle stays free of the
 * Reanimated dependency (same pattern as animation.web.tsx).
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ViewStyle } from 'react-native';
import { Text, View } from '@windforge/react-native';

// minHeight: the web Tabs root has no height of its own, so a
// content-sized placeholder would collapse behind the absolute header.
// '100vh' is a web unit RN's DimensionValue type does not know;
// react-native-web passes it through to CSS verbatim.
const webRootStyle: ViewStyle = { minHeight: '100vh' as unknown as ViewStyle['minHeight'] };

export default function MetricsScreenWeb() {
  return (
    // pt-20: the floating tab bar overlays the top ~66px of the viewport.
    <View className="flex-1 bg-zinc-100 pt-20 dark:bg-zinc-950" style={webRootStyle}>
      <SafeAreaView style={{ flex: 1 }}>
        <Text className="p-6 text-sm text-zinc-600 dark:text-zinc-500">
          Metrics screen is native-only in Phase 7 — run the iOS simulator
          (docs/guides/NATIVE_SETUP_IOS.md).
        </Text>
      </SafeAreaView>
    </View>
  );
}
