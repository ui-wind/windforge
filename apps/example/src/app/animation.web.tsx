/**
 * Web placeholder for the Animation screen.
 *
 * The native screen (animation.tsx) drives keyframes and transitions through
 * @windforge/reanimated; the web backend is out of scope for Phase 6, so the
 * web bundle stays free of the Reanimated dependency (same pattern as
 * animated-icon.web.tsx).
 */
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@windforge/react-native';

export default function AnimationScreenWeb() {
  return (
    <View className="flex-1 bg-zinc-950 dark:bg-zinc-900">
      <SafeAreaView style={{ flex: 1 }}>
        <Text className="p-6 text-sm text-zinc-400 dark:text-zinc-500">
          Animation screen is native-only in Phase 6 — run the iOS simulator
          (docs/guides/NATIVE_SETUP_IOS.md).
        </Text>
      </SafeAreaView>
    </View>
  );
}
