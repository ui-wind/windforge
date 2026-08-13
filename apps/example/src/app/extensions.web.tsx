/**
 * Web placeholder for the Extensions screen.
 *
 * The native screen (extensions.tsx) demos the Extension SDK, the custom
 * frontend artifact and the backend name; the web backend is out of scope
 * for Phase 8, so the web bundle stays free of the native extension surface
 * (same pattern as metrics.web.tsx).
 */
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@windforge/react-native';

export default function ExtensionsScreenWeb() {
  return (
    <View className="flex-1 bg-zinc-100 dark:bg-zinc-950">
      <SafeAreaView style={{ flex: 1 }}>
        <Text className="p-6 text-sm text-zinc-600 dark:text-zinc-500">
          Extensions screen is native-only in Phase 8 — run the iOS simulator
          (docs/guides/NATIVE_SETUP_IOS.md).
        </Text>
      </SafeAreaView>
    </View>
  );
}
