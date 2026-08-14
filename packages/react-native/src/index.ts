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
  TextInput,
  View,
  type ImageProps,
  type PressableProps,
  type StyledProps,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from './components.js';
export { evaluateCondition } from './conditions.js';
export { GroupContext, useGroupStates, type GroupStates } from './group.js';
export { __resetBackend, getBackend, selectBackend, setBackend } from './backends/index.js';
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
export { getConditions, subscribeConditions, useConditionState } from './provider.js';
export { __resetRegistry, getArtifacts, registerArtifact } from './registry.js';
export {
  resolveAnimationMeta,
  resolveClassName,
  resolveClassNameTiers,
  resolveClassNames,
  toReactNativeValue,
} from './resolve.js';
export type { AnimationMeta, ReactNativeStyle, ResolvedTiers } from './resolve.js';
export {
  componentStateSignature,
  stateSignature,
  type ComponentState,
  type ConditionState,
  type GroupInteractionState,
} from './state.js';
export {
  getInsets,
  getMetrics,
  setInsets,
  subscribeInsets,
  useInsets,
  useMetrics,
  __resetInsets,
  type SafeAreaInsets,
  type WindforgeMetrics,
} from './metrics.js';
export { cx, cn, type ClassValue } from './cx.js';
export {
  isCompatibleArtifact,
  SUPPORTED_ARTIFACT_VERSION,
  SUPPORTED_IR_VERSION,
  type ClassEntry,
  type RuntimeArtifact,
  type VariantEntry,
} from './types.js';
export {
  __resetRuntimeDiagnostics,
  getRuntimeDiagnostics,
  type RuntimeDiagnostics,
} from './diagnostics.js';
export {
  __resetComponentRegistry,
  getComponentMapping,
  registerComponent,
  styled,
  useWindforgeStyle,
  type ClassPropMapping,
  type ComponentMappingRecord,
} from './prop-mapping/index.js';
