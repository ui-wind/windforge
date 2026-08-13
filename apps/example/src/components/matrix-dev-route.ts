// Dev-only screenshot-automation hook (see NATIVE_SETUP_IOS.md,
// "Automating navigation on iOS 26+").
//
// iOS 26 shows an "Open in …?" confirmation for every externally opened
// custom-scheme URL (`xcrun simctl openurl` included), which blocks
// deep-link driven screenshot automation. This hook lets a runbook pick
// the initial route out-of-band instead: a host-side HTTP server on port
// 8082 serves the desired route (setup in NATIVE_SETUP_IOS.md,
// "Screenshot matrix automation"), and the app navigates to it on mount.
// Navigation per screen happens by relaunching the app (`simctl terminate`
// + `simctl launch`), which does not trigger the confirmation.
//
// Production builds are unaffected: the fetch only runs in __DEV__ and
// failures are swallowed (no server → app stays on the default route).
import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';

export function useMatrixRoute() {
  const pathname = usePathname();
  useEffect(() => {
    if (!__DEV__) return;
    fetch('http://localhost:8082/route')
      .then((r) => r.text())
      .then((route) => {
        const target = route.trim();
        if (target.startsWith('/') && target !== pathname) {
          router.replace(target as never);
        }
      })
      .catch(() => {});
    // Mount-only: each screen of a matrix run gets a fresh app launch.
  }, []);
}
