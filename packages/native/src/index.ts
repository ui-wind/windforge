/**
 * @windforge/native
 *
 * Native delivery for Windforge on React Native (New Architecture). Owns
 * the WindforgeStyle TurboModule wrapper and its installation into the
 * fabric backend of @windforge/react-native. Zero Tailwind imports: this
 * package only transports resolved styles.
 */
import { Platform } from 'react-native';
import {
  selectBackend,
  setFabricNativeAdapter,
  type NativeStyleAdapter,
  type ReactNativeStyle,
} from '@windforge/react-native';

import { getWindforgeStyleModule } from './module.js';

export { getWindforgeStyleModule, type WindforgeDiagnostics } from './module.js';

/** Wraps the TurboModule in the backend's transport contract. */
export function createNativeStyleAdapter(
  module: NonNullable<ReturnType<typeof getWindforgeStyleModule>>,
): NativeStyleAdapter {
  return {
    registerStyles(map: Record<string, ReactNativeStyle>): void {
      module.registerStyles(map);
    },
    updateStyles(diff: Record<string, ReactNativeStyle>): void {
      module.updateStyles(diff);
    },
    link(handle: number, className: string): void {
      module.link(handle, className);
    },
    unlink(handle: number): void {
      module.unlink(handle);
    },
    suspend(handle: number): void {
      module.suspend(handle);
    },
  };
}

/**
 * Enable the native delivery path. Call once at app boot (before
 * WindforgeProvider mounts):
 *
 * ```ts
 * import { installNativeDelivery } from '@windforge/native';
 * installNativeDelivery();
 * ```
 *
 * Behavior by platform:
 * - native + TurboModule present: selects the fabric backend and installs
 *   the adapter — condition changes update styles without React re-renders.
 * - native without the module (Expo Go, pod not installed): warns once and
 *   stays on the js-baseline backend.
 * - web: silent no-op (the fabric backend is meaningless there).
 */
export function installNativeDelivery(): void {
  if (Platform.OS === 'web') {
    return;
  }
  const module = getWindforgeStyleModule();
  if (!module) {
    console.warn(
      '@windforge/native: WindforgeStyle TurboModule not found. Add the ' +
        'package and run with a native build (Expo prebuild / dev client); ' +
        'Expo Go is not supported. Staying on the js-baseline backend.',
    );
    return;
  }
  setFabricNativeAdapter(createNativeStyleAdapter(module));
  selectBackend('fabric');
}

/** Restore the default js-baseline backend (test/reload helper). */
export function uninstallNativeDelivery(): void {
  setFabricNativeAdapter(null);
  selectBackend('js-baseline');
}
