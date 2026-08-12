import { Pressable, Text, View } from '@windforge/react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <View className="flex-1 bg-zinc-950 dark:bg-zinc-900">
      <SafeAreaView style={{ flex: 1 }}>
        <View className="flex-1 gap-4 p-6 sm:p-2">
          <Text className="text-3xl font-bold text-zinc-100 dark:text-zinc-300">Windforge</Text>
          <Text className="text-base text-zinc-400 dark:text-zinc-500">
            Tailwind CSS utilities, resolved to native styles at build time.
          </Text>

          <View className="mt-2 gap-3">
            <View className="rounded-lg bg-accent p-4">
              <Text className="text-sm font-semibold text-white">
                bg-accent — a custom @theme token
              </Text>
            </View>

            <View className="rounded-lg bg-white p-4 ios:bg-emerald-500">
              <Text className="text-sm font-semibold text-zinc-900 ios:text-white">
                ios:bg-emerald-500 — a platform variant
              </Text>
            </View>
          </View>

          <Pressable className="mt-4 rounded-lg bg-accent px-6 py-3">
            <Text className="text-center text-base font-semibold text-white">Styled Pressable</Text>
          </Pressable>

          <Text className="text-xs text-zinc-500">
            dark: variants follow the system color scheme. sm: padding kicks in on narrow windows.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}
