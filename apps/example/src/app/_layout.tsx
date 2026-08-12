import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { WindforgeProvider } from '@windforge/react-native';

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
      <WindforgeProvider>
        <AnimatedSplashOverlay />
        <AppTabs />
      </WindforgeProvider>
    </ThemeProvider>
  );
}
