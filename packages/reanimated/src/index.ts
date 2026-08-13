/**
 * @windforge/reanimated
 *
 * Class-driven animation on the UI thread: `animate-*` keyframes and
 * `transition-*` utilities resolved from the Windforge artifact, executed by
 * Reanimated. compile.ts stays Reanimated-free (pure planning); components
 * and the condition SharedValue mirror are the binding layer.
 */
export {
  AnimatedImage,
  AnimatedPressable,
  AnimatedText,
  AnimatedView,
  type ImageProps,
  type PressableProps,
  type TextProps,
  type ViewProps,
} from './components.js';
export {
  planKeyframes,
  planTransition,
  timingFunctionToEasing,
  type EasingDescriptor,
  type KeyframePlan,
  type KeyframePropertyPlan,
  type KeyframeSegment,
  type TransitionEntry,
  type TransitionPlan,
} from './compile.js';
export { useAnimatedConditionState, type AnimatedConditionState } from './conditions.js';
export {
  useAnimatedThemeProgress,
  type AnimatedThemeProgressOptions,
} from './theme.js';
