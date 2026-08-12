/**
 * Styled components: thin wrappers over React Native primitives that resolve
 * `className` through the active StyleBackend. The wrapped component accepts
 * both `className` and `style`; `style` wins on conflicts (escape hatch).
 *
 * js-baseline: components subscribe to condition state and re-render on
 * change (traditional behavior). fabric: components read the snapshot
 * without subscribing — condition updates are delivered natively via the
 * delivery protocol, and mount/unmount link the host node to its className.
 */
import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ComponentProps,
  type ElementType,
  type Ref,
} from 'react';
import {
  Image as RNImage,
  Pressable as RNPressable,
  Text as RNText,
  View as RNView,
  findNodeHandle,
} from 'react-native';
import { getBackend } from './backends/index.js';
import { useConditionState } from './provider.js';
import type { ReactNativeStyle } from './resolve.js';

export type StyledProps = {
  className?: string;
};

function mergeStyles(classNameStyle: ReactNativeStyle, style: unknown): unknown {
  if (style === undefined || style === null) return classNameStyle;
  return [classNameStyle, style];
}

function applyRef(ref: Ref<unknown>, instance: unknown): void {
  if (typeof ref === 'function') ref(instance);
  else if (ref !== null && ref !== undefined) {
    (ref as { current: unknown }).current = instance;
  }
}

function hostHandleOf(instance: unknown): number | null {
  // The native handle is the Fabric tag. findNodeHandle is the portable way
  // to get it from a host instance; in non-native environments (tests, web)
  // there is no host instance and linking is simply skipped.
  try {
    const handle = findNodeHandle(instance as Parameters<typeof findNodeHandle>[0]);
    return handle ?? null;
  } catch {
    return null;
  }
}

function createStyledComponent<Props extends { style?: unknown }>(
  Component: ElementType,
  displayName: string,
) {
  const Styled = forwardRef<unknown, Props & StyledProps>(function StyledComponent(
    props,
    ref: Ref<unknown>,
  ) {
    const { className, style, ...rest } = props as Props & StyledProps;
    const backend = getBackend();
    // Only backends that deliver through React props need to re-render on
    // condition changes; subscribing=false keeps the snapshot without it.
    const state = useConditionState(backend.requiresContext());
    const classNameStyle = className ? backend.resolveStyle(className, state) : {};

    const hostRef = useRef<unknown>(null);
    const setHostRef = useCallback(
      (instance: unknown) => {
        hostRef.current = instance;
        applyRef(ref, instance);
      },
      [ref],
    );

    useEffect(() => {
      if (!className || backend.link === undefined) return undefined;
      const handle = hostHandleOf(hostRef.current);
      if (handle === null) return undefined;
      backend.link(handle, className, state);
      return () => backend.unlink?.(handle);
      // `state` is only read as a fallback snapshot by the fabric backend
      // (its live state comes from the provider's condition store), and it
      // never changes while the component is unsubscribed.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [backend, className]);

    return createElement(Component, {
      ...rest,
      style: mergeStyles(classNameStyle, style),
      ref: backend.link ? setHostRef : ref,
    });
  });
  Styled.displayName = `Windforge${displayName}`;
  return Styled;
}

export type ViewProps = ComponentProps<typeof RNView> & StyledProps;
export type TextProps = ComponentProps<typeof RNText> & StyledProps;
export type ImageProps = ComponentProps<typeof RNImage> & StyledProps;
export type PressableProps = ComponentProps<typeof RNPressable> & StyledProps;

export const View = createStyledComponent<ViewProps>(RNView, 'View');
export const Text = createStyledComponent<TextProps>(RNText, 'Text');
export const Image = createStyledComponent<ImageProps>(RNImage, 'Image');
export const Pressable = createStyledComponent<PressableProps>(RNPressable, 'Pressable');
