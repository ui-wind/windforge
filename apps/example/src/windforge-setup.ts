/**
 * Windforge native delivery bootstrap.
 *
 * Enables the fabric backend when the WindforgeStyle TurboModule is
 * present (native builds via `expo prebuild` / dev client). Everywhere
 * else — web, Expo Go, or the pod missing — it degrades silently to the
 * js-baseline backend, so this single call covers every target.
 *
 * Must run before WindforgeProvider mounts.
 */
import { Appearance } from 'react-native';
import { getWindforgeStyleModule, installNativeDelivery } from '@windforge/native';

installNativeDelivery();

// Dev-only verification hook: log the native delivery counters at boot and
// on every appearance flip so a simulator run can prove the update path
// works without React re-renders. Compiled out of release builds.
if (__DEV__) {
  const module = getWindforgeStyleModule();
  const report = (trigger: string) => {
    module?.getDiagnostics((diagnostics) => {
      console.log(`[windforge] ${trigger}`, JSON.stringify(diagnostics));
    });
  };
  report('boot');
  Appearance.addChangeListener(() => report('appearance'));
}
