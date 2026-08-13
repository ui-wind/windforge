/**
 * Web placeholder for the Extensions screen.
 *
 * The native screen (extensions.tsx) demos the Extension SDK, the custom
 * frontend artifact and the backend name; the web backend is out of scope
 * for Phase 8, so the web bundle stays free of the native extension surface
 * (same pattern as metrics.web.tsx).
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ViewStyle } from 'react-native';
import { Text, View } from '@windforge/react-native';

// minHeight: the web Tabs root has no height of its own, so a
// content-sized placeholder would collapse behind the absolute header.
// '100vh' is a web unit RN's DimensionValue type does not know;
// react-native-web passes it through to CSS verbatim.
const webRootStyle: ViewStyle = { minHeight: '100vh' as unknown as ViewStyle['minHeight'] };

export default function ExtensionsScreenWeb() {
  return (
    // pt-20: the floating tab bar overlays the top ~66px of the viewport.
    <View className="flex-1 bg-zinc-100 pt-20 dark:bg-zinc-950" style={webRootStyle}>
      <SafeAreaView style={{ flex: 1 }}>
        <Text className="p-6 text-sm text-zinc-600 dark:text-zinc-500">
          Extensions screen is native-only in Phase 8 — run the iOS simulator
          (docs/guides/NATIVE_SETUP_IOS.md).
        </Text>
      </SafeAreaView>
    </View>
  );
}
