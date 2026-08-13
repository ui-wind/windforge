import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { WindforgeProvider } from '@windforge/react-native';
import { WindforgeSafeAreaProvider } from '@windforge/react-native/safe-area';

// Enables the fabric backend on native builds (no-op on web / Expo Go).
// Must run before WindforgeProvider mounts.
import '@/windforge-setup';

// Registers the compiled Windforge artifact (built by compileWindforge in
// metro.config.js) with the runtime.
import 'windforge/generated';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <WindforgeSafeAreaProvider>
        <WindforgeProvider>
          <AnimatedSplashOverlay />
          <AppTabs />
        </WindforgeProvider>
      </WindforgeSafeAreaProvider>
    </ThemeProvider>
  );
}
