/**
 * Windforge bare RN CLI demo screen.
 *
 * Verifies @windforge/react-native on a plain React Native CLI project (no
 * Expo): Tailwind-first className styling lowered to RN styles at build
 * time, dark: variants resolved through the condition store, and an @theme
 * token (--color-accent) lowered to a real utility. The button cycles
 * system → light → dark through WindforgeProvider's colorScheme override.
 */
import { useState } from 'react';
import { Pressable, Text, View, WindforgeProvider } from '@windforge/react-native';
import 'windforge/generated';

type Scheme = 'system' | 'light' | 'dark';

const NEXT: Record<Scheme, Scheme> = { system: 'light', light: 'dark', dark: 'system' };

function DemoScreen({ scheme, onCycle }: { scheme: Scheme; onCycle: () => void }) {
  return (
    <View className="flex-1 bg-zinc-100 p-6 pt-16 dark:bg-zinc-950">
      <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Windforge Bare</Text>
      <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        React Native CLI · Tailwind v4 · build-time Style IR
      </Text>

      <View className="mt-8 flex-row">
        <View className="mr-3 h-16 w-16 rounded-lg bg-accent" />
        <View className="mr-3 h-16 w-16 rounded-lg bg-zinc-300 dark:bg-zinc-700" />
        <View className="h-16 w-16 rounded-lg bg-zinc-900 dark:bg-zinc-50" />
        <View className="ml-3 h-16 w-16 rounded-lg bg-rose-500" />
      </View>

      <View className="mt-6 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
        <Text className="text-sm text-zinc-700 dark:text-zinc-300">
          className strings compile to static styles; dark: variants switch with the color
          scheme.
        </Text>
      </View>

      <Pressable
        onPress={onCycle}
        className="mt-8 items-center rounded-lg bg-zinc-900 p-4 dark:bg-zinc-50"
      >
        <Text className="text-sm font-semibold text-zinc-50 dark:text-zinc-900">
          {`Color scheme: ${scheme}`}
        </Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  const [scheme, setScheme] = useState<Scheme>('system');
  return (
    <WindforgeProvider colorScheme={scheme === 'system' ? undefined : scheme}>
      <DemoScreen scheme={scheme} onCycle={() => setScheme((current) => NEXT[current])} />
    </WindforgeProvider>
  );
}
