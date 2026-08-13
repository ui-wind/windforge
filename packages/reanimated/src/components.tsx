/**
 * Animated styled primitives.
 *
 * Opt-in replacements for the @windforge/react-native primitives that drive
 * class-driven keyframes (`animate-*`) and transitions (`transition-*` and
 * friends) with Reanimated on the UI thread:
 *
 * - one React render per className/condition change, zero renders per frame
 *   (Rule 6): interpolation runs entirely inside `useAnimatedStyle`;
 * - per-property SharedValues (`sv.value.prop = withTiming(...)` would not
 *   animate — reanimated limitation);
 * - `style = [baseResolved, animatedStyle, userStyle]` — user style still
 *   wins (Phase 5 escape hatch).
 *
 * Fabric: animated components deliberately do NOT link through the native
 * delivery protocol — suspend is whole-node only, and animated nodes need
 * per-property ownership that does not exist yet (decision record in the
 * roadmap). They always subscribe to condition state and re-render.
 */
import {
  createElement,
  forwardRef,
  useEffect,
  useRef,
  type ComponentProps,
  type ElementType,
} from 'react';
import {
  Image as RNImage,
  Pressable as RNPressable,
  Text as RNText,
  View as RNView,
} from 'react-native';
import Animated, {
  Easing,
  makeMutable,
  useAnimatedStyle,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type EasingFunction,
  type EasingFunctionFactory,
  type SharedValue,
} from 'react-native-reanimated';
import type { AnimationIR, IRValue } from '@windforge/ir';
import {
  getBackend,
  resolveAnimationMeta,
  toReactNativeValue,
  useConditionState,
  type AnimationMeta,
  type ReactNativeStyle,
} from '@windforge/react-native';
import {
  planKeyframes,
  planTransition,
  type EasingDescriptor,
  type KeyframePropertyPlan,
} from './compile.js';

type Scalar = string | number;

type TransformOpEntry = {
  operation: string;
  /** '' for bare numbers; 'deg' | '%' | 'rad' for formatted values. */
  suffix: string;
  values: SharedValue<number>[];
};

type SVRegistry = {
  scalars: Record<string, SharedValue<Scalar>>;
  transforms: TransformOpEntry[];
  /** Scalar keys owned by the running keyframes (transitions skip these). */
  keyframeKeys: Set<string>;
};

function createRegistry(): SVRegistry {
  return { scalars: {}, transforms: [], keyframeKeys: new Set() };
}

function descriptorToEasing(descriptor: EasingDescriptor): EasingFunction | EasingFunctionFactory {
  switch (descriptor.kind) {
    case 'linear':
      return Easing.linear;
    case 'bezier':
      return Easing.bezier(...descriptor.points);
    case 'steps':
      return Easing.steps(descriptor.steps, descriptor.roundToNextStep);
  }
}

/** Numeric part + unit suffix of a scalar IR value ('360deg' → 360, 'deg'). */
function numericFromIR(value: IRValue): { number: number; suffix: string } | null {
  if (value.kind === 'number') return { number: value.value, suffix: '' };
  if (value.kind === 'dimension') {
    return value.unit === 'percent'
      ? { number: value.value, suffix: '%' }
      : { number: value.value, suffix: '' };
  }
  if (value.kind === 'string') {
    const match = /^(-?[\d.]+)(deg|%|rad)?$/u.exec(value.value);
    if (!match?.[1]) return null;
    return { number: Number(match[1]), suffix: match[2] ?? '' };
  }
  return null;
}

type TransformOp = { operation: string; suffix: string; numbers: number[] };

/** TransformValueIR → per-operation numeric records (null when anything is
 * non-numeric — the binding cannot interpolate it). */
function transformOperationsFromIR(value: IRValue | undefined): TransformOp[] | null {
  if (!value || value.kind !== 'transform') return null;
  const ops: TransformOp[] = [];
  for (const operation of value.operations) {
    if (operation.operation === 'translate') {
      const first = numericFromIR(operation.value[0]);
      const second = numericFromIR(operation.value[1]);
      if (!first || !second || first.suffix !== second.suffix) return null;
      ops.push({
        operation: 'translate',
        suffix: first.suffix,
        numbers: [first.number, second.number],
      });
      continue;
    }
    const numeric = numericFromIR(operation.value);
    if (!numeric) return null;
    ops.push({ operation: operation.operation, suffix: numeric.suffix, numbers: [numeric.number] });
  }
  return ops;
}

function clearKeyframeSVs(registry: SVRegistry): void {
  registry.transforms = [];
  for (const key of registry.keyframeKeys) delete registry.scalars[key];
  registry.keyframeKeys.clear();
}

/** Attach one property's keyframe segments to its SharedValue(s). */
function startKeyframeProperty(
  registry: SVRegistry,
  plan: ReturnType<typeof planKeyframes>,
  propertyPlan: KeyframePropertyPlan,
  baseStyle: ReactNativeStyle,
): void {
  const reps = plan.iterations === 'infinite' ? -1 : plan.iterations;
  // withRepeat's types are narrower than AnimatableValue (color strings are
  // valid animation objects at runtime); widen through casts.
  const wrap = (sequence: number | string): Scalar =>
    withDelay(
      plan.delayMs,
      withRepeat(sequence as number, reps, plan.alternate),
    ) as unknown as Scalar;

  if (propertyPlan.property === 'transform') {
    const firstSegment = propertyPlan.segments[0];
    // Shape comes from any frame; the START value only from an explicit 0%
    // frame or the first segment's `from` — an implicit start animates from
    // identity (0), never from the target.
    const shapeOps = transformOperationsFromIR(
      propertyPlan.initialValue ?? firstSegment?.from ?? firstSegment?.to,
    );
    const startOps = transformOperationsFromIR(
      propertyPlan.initialValue ?? firstSegment?.from,
    );
    if (!shapeOps) return;
    for (let i = 0; i < shapeOps.length; i++) {
      const shapeOp = shapeOps[i];
      if (!shapeOp) continue;
      let entry = registry.transforms[i];
      if (
        !entry ||
        entry.operation !== shapeOp.operation ||
        entry.suffix !== shapeOp.suffix ||
        entry.values.length !== shapeOp.numbers.length
      ) {
        const startOp = startOps?.[i];
        entry = {
          operation: shapeOp.operation,
          suffix: shapeOp.suffix,
          values: shapeOp.numbers.map((_, axis) => makeMutable(startOp?.numbers[axis] ?? 0)),
        };
        registry.transforms[i] = entry;
      }
      // Every axis runs the same segment timeline in parallel.
      for (let axis = 0; axis < entry.values.length; axis++) {
        const timings = propertyPlan.segments.map((segment) => {
          const segmentOps = transformOperationsFromIR(segment.to);
          const target = segmentOps?.[i]?.numbers[axis];
          return withTiming(target ?? 0, {
            duration: segment.durationMs,
            easing: descriptorToEasing(segment.easing),
          });
        });
        const sv = entry.values[axis];
        if (sv) sv.value = wrap(withSequence(...timings)) as number;
      }
    }
    registry.transforms.length = shapeOps.length;
    return;
  }

  const firstSegment = propertyPlan.segments[0];
  const startValue = propertyPlan.initialValue ?? firstSegment?.from;
  const base = baseStyle[propertyPlan.property];
  const existing = registry.scalars[propertyPlan.property];
  const sv = existing ?? makeMutable(0 as Scalar);
  registry.scalars[propertyPlan.property] = sv;
  registry.keyframeKeys.add(propertyPlan.property);
  if (!existing) {
    // Explicit 0% frame or segment start wins; otherwise the resolved base
    // value, else identity (0).
    sv.value = startValue
      ? (toReactNativeValue(startValue) as Scalar)
      : typeof base === 'number' || typeof base === 'string'
        ? base
        : 0;
  }
  const timings = propertyPlan.segments.map((segment) =>
    withTiming(toReactNativeValue(segment.to) as Scalar, {
      duration: segment.durationMs,
      easing: descriptorToEasing(segment.easing),
    }),
  );
  sv.value = wrap(withSequence(...timings));
}

/** Shared animation behavior for every animated primitive. */
function useWindforgeAnimated(
  className: string | undefined,
  style: unknown,
): unknown {
  // Always subscribe: animated components never link through native delivery
  // (see module note), so condition changes re-render even on fabric.
  const state = useConditionState(true);
  const resolved = getBackend().resolveStyle(className ?? '', state);
  const meta: AnimationMeta | null = resolveAnimationMeta(className ?? '');
  const animation: AnimationIR | undefined = meta?.animation;
  const transition = meta?.transition;

  const registryRef = useRef<SVRegistry | null>(null);
  if (registryRef.current === null) registryRef.current = createRegistry();
  const registry = registryRef.current;

  // Keyframes: start once per animation identity; SVs persist across renders.
  useEffect(() => {
    if (!animation) {
      clearKeyframeSVs(registry);
      return;
    }
    const plan = planKeyframes(animation);
    for (const propertyPlan of plan.properties) {
      startKeyframeProperty(registry, plan, propertyPlan, resolved);
    }
    // `resolved` is only read for initial scalar values at start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animation]);

  const prevStyleRef = useRef<ReactNativeStyle | null>(null);

  // Transitions: diff the previous resolved style, animate covered diffs,
  // let everything else ride the base style object (snap).
  useEffect(() => {
    const prev = prevStyleRef.current;
    prevStyleRef.current = resolved;
    if (!prev || !transition) {
      for (const key of Object.keys(registry.scalars)) {
        if (!registry.keyframeKeys.has(key)) delete registry.scalars[key];
      }
      return;
    }
    const plan = planTransition(transition, prev, resolved);
    const animating = new Set(plan.animations.map((entry) => entry.property));
    for (const key of Object.keys(registry.scalars)) {
      if (!registry.keyframeKeys.has(key) && !animating.has(key)) delete registry.scalars[key];
    }
    for (const entry of plan.animations) {
      // Reuse a mid-flight SV so an interrupted transition retimes from its
      // current value instead of jumping.
      const existing = registry.scalars[entry.property];
      const from = existing?.value ?? (prev[entry.property] as Scalar);
      const sv = existing ?? makeMutable(from);
      registry.scalars[entry.property] = sv;
      sv.value = withDelay(
        entry.delayMs,
        withTiming(entry.to as Scalar, {
          duration: entry.durationMs,
          easing: descriptorToEasing(entry.easing),
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, transition]);

  const animatedStyle = useAnimatedStyle(() => {
    const result: Record<string, unknown> = {};
    const current = registryRef.current;
    if (!current) return result;
    for (const key of Object.keys(current.scalars)) {
      const sv = current.scalars[key];
      if (sv) result[key] = sv.value;
    }
    if (current.transforms.length > 0) {
      const transform: Array<Record<string, unknown>> = [];
      for (const entry of current.transforms) {
        const formatted = (value: number) =>
          entry.suffix === '' ? value : `${value}${entry.suffix}`;
        if (entry.operation === 'translate') {
          const x = entry.values[0]?.value ?? 0;
          const y = entry.values[1]?.value ?? 0;
          transform.push({ translate: [formatted(x), formatted(y)] });
        } else {
          const value = entry.values[0]?.value ?? 0;
          transform.push({ [entry.operation]: formatted(value) });
        }
      }
      result.transform = transform;
    }
    return result;
  });

  // Array composition (not spread): reanimated's animated style must stay a
  // separate entry, and user style keeps its escape-hatch priority.
  const merged: unknown[] = [resolved, animatedStyle];
  if (style !== undefined && style !== null) merged.push(style);
  return merged;
}

function createAnimatedComponent<Props extends { style?: unknown }>(
  Host: ElementType,
  displayName: string,
) {
  const Component = forwardRef<unknown, Props & { className?: string }>(
    function AnimatedStyledComponent(props, ref) {
      const { className, style, ...rest } = props as { className?: string; style?: unknown } &
        Record<string, unknown>;
      const mergedStyle = useWindforgeAnimated(className, style);
      return createElement(Host, { ...rest, style: mergedStyle, ref });
    },
  );
  Component.displayName = `WindforgeAnimated${displayName}`;
  return Component;
}

export type ViewProps = ComponentProps<typeof RNView> & { className?: string };
export type TextProps = ComponentProps<typeof RNText> & { className?: string };
export type ImageProps = ComponentProps<typeof RNImage> & { className?: string };
export type PressableProps = ComponentProps<typeof RNPressable> & { className?: string };

export const AnimatedView = createAnimatedComponent<ViewProps>(Animated.View, 'View');
export const AnimatedText = createAnimatedComponent<TextProps>(Animated.Text, 'Text');
export const AnimatedImage = createAnimatedComponent<ImageProps>(Animated.Image, 'Image');
export const AnimatedPressable = createAnimatedComponent<PressableProps>(
  Animated.createAnimatedComponent(RNPressable),
  'Pressable',
);
