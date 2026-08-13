/**
 * @windforge/ir — Windforge Style IR.
 *
 * The platform-independent contract between style frontends and platform
 * backends. Zero dependencies; imports no React Native, React Native Web,
 * Reanimated, Nitro, JSI, Fabric, Flutter or DOM types.
 */
export { IR_VERSION } from './version.js';
export type { CanonicalProperty } from './properties.js';
export {
  KNOWN_CANONICAL_PROPERTIES,
  isKnownCanonicalProperty,
} from './properties.js';
export type {
  IRValue,
  NumberValueIR,
  StringValueIR,
  ColorValueIR,
  TokenValueIR,
  VariableValueIR,
  CalcValueIR,
  DimensionValueIR,
  ListValueIR,
  TransformValueIR,
  TransformOperationIR,
  ConditionalValueIR,
  RuntimeValueIR,
  ValueClassification,
  DimensionUnit,
} from './values.js';
export { classifyValue } from './values.js';
export type {
  ConditionIR,
  ConditionKind,
  MediaConditionIR,
  MediaFeature,
  ColorSchemeConditionIR,
  PlatformConditionIR,
  StateConditionIR,
  InteractionState,
  ContainerConditionIR,
  ContainerOperator,
  CustomConditionIR,
} from './conditions.js';
export type {
  AnimationIR,
  KeyframeIR,
  TimeIR,
  TimingFunctionIR,
  AnimationDirection,
  AnimationFillMode,
} from './animation.js';
export type {
  StyleIR,
  DeclarationIR,
  VariantIR,
  TokenIR,
  SourceMetadata,
} from './ir.js';
export { emptyIR } from './ir.js';
export type { CanonicalOptions } from './canonical.js';
export { toCanonicalJson, toCanonicalString } from './canonical.js';
export { hashIR, hashCanonical } from './hash.js';
export { parseStaticUtility } from './static-utility.js';
