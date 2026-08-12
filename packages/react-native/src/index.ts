/**
 * @windforge/react-native
 *
 * Runtime for React Native (New Architecture only). Zero Tailwind imports:
 * this package only understands the runtime artifact format produced by
 * @windforge/tailwind.
 */
export {
  Image,
  Pressable,
  Text,
  View,
  type ImageProps,
  type PressableProps,
  type StyledProps,
  type TextProps,
  type ViewProps,
} from './components.js';
export { evaluateCondition } from './conditions.js';
export { __resetBackend, getBackend, selectBackend } from './backends/index.js';
export {
  setFabricNativeAdapter,
  type NativeStyleAdapter,
} from './backends/fabric.js';
export type {
  StyleBackend,
  StyleBackendName,
  StyleHandle,
} from './backends/types.js';
export { WindforgeProvider, useWindforge, type WindforgeProviderProps } from './provider.js';
export { __resetRegistry, getArtifacts, registerArtifact } from './registry.js';
export {
  resolveClassName,
  resolveClassNames,
  toReactNativeValue,
} from './resolve.js';
export { stateSignature, type ConditionState } from './state.js';
export {
  isCompatibleArtifact,
  SUPPORTED_ARTIFACT_VERSION,
  SUPPORTED_IR_VERSION,
  type ClassEntry,
  type RuntimeArtifact,
  type VariantEntry,
} from './types.js';
