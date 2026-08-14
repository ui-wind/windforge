/**
 * Named themes screen (Phase 12).
 *
 * Demos the axes of named-theme switching that are visually verifiable:
 *  - Global theme switching via setTheme (Light / Dark / Sunset / Ocean);
 *  - Theme-variant utilities (sunset:bg-red-500, ocean:bg-sky-500) that
 *    activate only when their named theme is current;
 *  - ScopedTheme subtree override — a card inside <ScopedTheme name="ocean">
 *    uses ocean:bg-sky-500 which stays active regardless of global theme;
 *  - useCSSVariable readout showing the live resolved value from the
 *    artifact's per-theme variable table.
 *
 * Known limitation (honesty, Rule 14): Tailwind @theme tokens like bg-accent
 * are statically substituted at build time (IR carries kind:"color" with a
 * hex literal, NOT kind:"variable"). This means bg-accent always resolves to
 * #3b82f6 and does not change on theme switch. The variable-resolution path
 * in resolve.ts (kind:"variable" cascade through scoped → global overrides
 * → artifact theme table) exists and is unit-tested, but no current lowering
 * produces kind:"variable" IR for resolvable @theme references. ScopedVariables
 * has no visible effect on static-color utilities. Forward-compatible: when a
 * future lowering preserves var() references as kind:"variable", the cascade
 * will work without runtime changes.
 *
 * Pixel-verify runbook (see docs/guides/NATIVE_SETUP_*.md):
 *   Accent card          = #3b82f6 always (static token)
 *   sunset-variant card  = idle #27272a, active (sunset theme) #fb2c36
 *   ocean-variant card   = idle #27272a, active (ocean theme) #00a6f4
 *   ScopedTheme card     = #00a6f4 always (ocean:bg-sky-500 active in scope)
 *   useCSSVariable       = matches current theme's --color-accent value
 */
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Pressable,
  Text,
  View,
  ScopedTheme,
  setTheme,
  useWindforgeTheme,
  useCSSVariable,
} from '@windforge/react-native';

const THEMES = [
  { name: 'light', label: 'Light' },
  { name: 'dark', label: 'Dark' },
  { name: 'sunset', label: 'Sunset' },
  { name: 'ocean', label: 'Ocean' },
] as const;

export default function ThemesScreen() {
  const { current } = useWindforgeTheme();
  const accentValue = useCSSVariable('--color-accent');

  return (
    <View className="flex-1 bg-zinc-950 dark:bg-zinc-900">
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView className="flex-1 p-6">
          <Text className="text-2xl font-bold text-zinc-100 dark:text-zinc-300">Themes</Text>
          <Text className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
            Named themes, scoped subtrees, and theme-variant utilities.
          </Text>

          {/* ---- theme switcher ---------------------------------------------- */}
          <Text className="mt-6 text-xs font-semibold text-zinc-500">Global theme</Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {THEMES.map((t) => {
              const active = current === t.name;
              return (
                <Pressable
                  key={t.name}
                  testID={`themes-switch-${t.name}`}
                  onPress={() => setTheme(t.name)}
                  className={`rounded-full px-4 py-2 ${
                    active ? 'bg-accent' : 'bg-zinc-800'
                  }`}>
                  <Text
                    className={`text-sm font-semibold ${
                      active ? 'text-white' : 'text-zinc-300'
                    }`}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text className="mt-2 text-xs text-zinc-500">current: {current}</Text>

          {/* ---- accent card (static token) ---------------------------------- */}
          <Text className="mt-6 text-xs font-semibold text-zinc-500">
            bg-accent (static #3b82f6 — @theme tokens lowered at build time)
          </Text>
          <View testID="themes-accent-card" className="mt-2 rounded-lg bg-accent p-4">
            <Text className="text-center text-sm font-semibold text-white">
              bg-accent
            </Text>
          </View>

          {/* ---- theme-variant utilities ------------------------------------- */}
          <Text className="mt-6 text-xs font-semibold text-zinc-500">
            Theme-variant utilities (activate per theme)
          </Text>
          <View className="mt-2 gap-2">
            <View
              testID="themes-sunset-variant"
              className="rounded-lg bg-zinc-800 p-3 sunset:bg-red-500">
              <Text className="text-sm text-zinc-200">sunset:bg-red-500</Text>
            </View>
            <View
              testID="themes-ocean-variant"
              className="rounded-lg bg-zinc-800 p-3 ocean:bg-sky-500">
              <Text className="ocean:text-blue-200 text-sm text-zinc-200">
                ocean:bg-sky-500 + ocean:text-blue-200
              </Text>
            </View>
          </View>

          {/* ---- scoped theme subtree ---------------------------------------- */}
          <Text className="mt-6 text-xs font-semibold text-zinc-500">
            ScopedTheme (subtree locked to ocean — ocean:bg-sky-500 always active)
          </Text>
          <ScopedTheme name="ocean">
            <View
              testID="themes-scoped-card"
              className="mt-2 rounded-lg bg-zinc-800 p-4 ocean:bg-sky-500">
              <Text className="text-center text-sm font-semibold text-white">
                ocean scoped
              </Text>
            </View>
          </ScopedTheme>

          {/* ---- live variable readout --------------------------------------- */}
          <Text className="mt-6 text-xs font-semibold text-zinc-500">
            useCSSVariable(&apos;--color-accent&apos;)
          </Text>
          <View testID="themes-readout" className="mt-2 rounded-lg bg-zinc-800 p-3">
            <Text className="text-sm font-mono text-zinc-200">
              {accentValue ?? '(undefined)'}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
