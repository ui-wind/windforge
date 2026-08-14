/**
 * Interactive variants screen (Phase 11).
 *
 * Demos every interactive lowering the compiler now ships:
 *  - `active:` / `hover:` / `focus:` / `disabled:` pseudo-state variants,
 *    driven by the component's own press/hover/focus events;
 *  - `group` / `group/<name>` propagation to styled descendants
 *    (`group-active:` restyles the child while the parent is pressed);
 *  - `data-*` props feeding `data-[]` variants (`data-[selected=true]:`).
 *
 * Pixel-verify runbook (see docs/guides/NATIVE_SETUP_*.md): long-press the
 * Pressed box, tap the Focus input, and compare the Disabled rows against
 * the enabled ones.
 */
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, Text, TextInput, View } from '@windforge/react-native';

export default function InteractiveScreen() {
  const [selected, setSelected] = useState(false);

  return (
    <View className="flex-1 bg-zinc-950 dark:bg-zinc-900">
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView className="flex-1 p-6">
          <Text className="text-2xl font-bold text-zinc-100 dark:text-zinc-300">Interactive</Text>
          <Text className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
            Pseudo-state, group, and data-* variants resolved from component state.
          </Text>

          {/* ---- pressed --------------------------------------------------- */}
          <Text className="mt-6 text-xs font-semibold text-zinc-500">active: (hold to press)</Text>
          <Pressable
            testID="interactive-pressed"
            className="mt-2 rounded-lg bg-accent p-4 active:bg-emerald-500">
            <Text className="text-center text-sm font-semibold text-white">
              active:bg-emerald-500
            </Text>
          </Pressable>

          {/* ---- hover ------------------------------------------------------ */}
          <Text className="mt-6 text-xs font-semibold text-zinc-500">hover: (pointer / web)</Text>
          <Pressable
            testID="interactive-hover"
            className="mt-2 rounded-lg bg-accent p-4 hover:bg-blue-500">
            <Text className="text-center text-sm font-semibold text-white">
              hover:bg-blue-500
            </Text>
          </Pressable>

          {/* ---- focus ------------------------------------------------------ */}
          <Text className="mt-6 text-xs font-semibold text-zinc-500">focus: (tap to focus)</Text>
          <TextInput
            testID="interactive-focus"
            className="mt-2 rounded-lg bg-white p-4 text-zinc-900 focus:bg-amber-500"
            placeholder="focus:bg-amber-500"
            placeholderTextColor="#71717a"
          />

          {/* ---- disabled --------------------------------------------------- */}
          <Text className="mt-6 text-xs font-semibold text-zinc-500">disabled:</Text>
          <Pressable
            testID="interactive-disabled-button"
            disabled
            className="mt-2 rounded-lg bg-accent p-4 disabled:opacity-50">
            <Text className="text-center text-sm font-semibold text-white">
              disabled:opacity-50 (Pressable)
            </Text>
          </Pressable>
          <TextInput
            testID="interactive-disabled-input"
            editable={false}
            className="mt-2 rounded-lg bg-white p-4 text-zinc-900 disabled:opacity-50"
            value="disabled:opacity-50 (editable={false})"
          />

          {/* ---- group propagation ------------------------------------------ */}
          <Text className="mt-6 text-xs font-semibold text-zinc-500">
            group (press the card — the child text restyles)
          </Text>
          <Pressable
            testID="interactive-group"
            className="group mt-2 gap-1 rounded-lg bg-zinc-800 p-4 active:bg-zinc-700">
            <Text className="group-active:text-emerald-400 text-sm text-zinc-300">
              group-active:text-emerald-400
            </Text>
            <Text className="text-xs text-zinc-500">anonymous group</Text>
          </Pressable>
          <Pressable
            testID="interactive-group-named"
            className="group/card mt-2 gap-1 rounded-lg bg-zinc-800 p-4 active:bg-zinc-700">
            <Text className="group-active/card:text-blue-400 text-sm text-zinc-300">
              group-active/card:text-blue-400
            </Text>
            <Text className="group-active:text-blue-400 text-xs text-zinc-500">
              anonymous variant stays idle inside group/card
            </Text>
          </Pressable>

          {/* ---- data-* ------------------------------------------------------ */}
          <Text className="mt-6 text-xs font-semibold text-zinc-500">
            data-* (tap to toggle data-selected)
          </Text>
          <Pressable
            testID="interactive-data-toggle"
            className="mt-2 rounded-lg bg-zinc-800 p-4 active:bg-zinc-700"
            onPress={() => setSelected((value) => !value)}>
            <Text className="text-center text-sm font-semibold text-zinc-200">
              {selected ? 'selected (tap to clear)' : 'not selected (tap to select)'}
            </Text>
          </Pressable>
          <View
            testID="interactive-data-target"
            data-selected={selected}
            className="mt-2 rounded-lg bg-zinc-800 p-4 data-[selected=true]:bg-emerald-500">
            <Text className="text-center text-sm font-semibold text-zinc-200">
              data-[selected=true]:bg-emerald-500
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
