/**
 * Web placeholder for the Animation screen.
 *
 * The native screen (animation.tsx) drives keyframes and transitions through
 * @windforge/reanimated; the web backend is out of scope for Phase 6, so the
 * web bundle stays free of the Reanimated dependency (same pattern as
 * animated-icon.web.tsx).
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ViewStyle } from 'react-native';
import { Text, View } from '@windforge/react-native';

// minHeight: the web Tabs root has no height of its own, so a
// content-sized placeholder would collapse behind the absolute header.
// '100vh' is a web unit RN's DimensionValue type does not know;
// react-native-web passes it through to CSS verbatim.
const webRootStyle: ViewStyle = { minHeight: '100vh' as unknown as ViewStyle['minHeight'] };

export default function AnimationScreenWeb() {
  return (
    // pt-20: the floating tab bar overlays the top ~66px of the viewport.
    <View className="flex-1 bg-zinc-950 pt-20 dark:bg-zinc-900" style={webRootStyle}>
      <SafeAreaView style={{ flex: 1 }}>
        <Text className="p-6 text-sm text-zinc-400 dark:text-zinc-500">
          Animation screen is native-only in Phase 6 — run the iOS simulator
          (docs/guides/NATIVE_SETUP_IOS.md).
        </Text>
      </SafeAreaView>
    </View>
  );
}
