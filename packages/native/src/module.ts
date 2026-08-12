/**
 * JS side of the WindforgeStyle TurboModule.
 *
 * The native surface is a fixed protocol contract
 * (docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md), not app codegen: the
 * module needs raw UIManager access, which generated bindings do not
 * provide. So there is no codegen spec file — the TS types below mirror
 * the protocol 1:1 and the ObjC++ host implements it by hand.
 */
import { TurboModuleRegistry } from 'react-native';

import type { ReactNativeStyle } from '@windforge/react-native';

/** Diagnostic counters reported by the native store. */
export interface WindforgeDiagnostics {
  /** Native module installed and holding the UIManager. */
  available: boolean;
  /** Registered classNames. */
  styles?: number;
  /** Live family → className bindings. */
  bindings?: number;
  /** Total className registrations/updates received from JS. */
  styleUpdates?: number;
  /** Successful link() calls. */
  links?: number;
  /** updateStyles calls that actually pushed to the ShadowTree. */
  pushes?: number;
  /** React commits observed by the commit hook. */
  commitsObserved?: number;
  /** React commits the hook mutated (styles re-merged). */
  commitsMutated?: number;
}

interface NativeWindforgeStyle {
  registerStyles(map: Record<string, ReactNativeStyle>): void;
  updateStyles(diff: Record<string, ReactNativeStyle>): void;
  link(tag: number, className: string): void;
  suspend(tag: number): void;
  unlink(tag: number): void;
  getDiagnostics(callback: (result: WindforgeDiagnostics) => void): void;
}

/**
 * Returns the native module, or null when it is not registered (Expo Go,
 * web, old architecture, or the pod missing). Callers must handle null:
 * absence is a supported configuration that degrades to the JS baseline.
 */
export function getWindforgeStyleModule(): NativeWindforgeStyle | null {
  return TurboModuleRegistry.get('WindforgeStyle') as NativeWindforgeStyle | null;
}
