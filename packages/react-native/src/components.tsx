/**
 * Styled components: thin wrappers over React Native primitives that resolve
 * `className` through the Windforge runtime. The wrapped component accepts
 * both `className` and `style`; `style` wins on conflicts (escape hatch).
 */
import {
  createElement,
  forwardRef,
  type ComponentProps,
  type ElementType,
  type Ref,
} from 'react';
import {
  Image as RNImage,
  Pressable as RNPressable,
  Text as RNText,
  View as RNView,
} from 'react-native';
import { useWindforge } from './provider.js';
import { resolveClassNames, type ReactNativeStyle } from './resolve.js';

export type StyledProps = {
  className?: string;
};

function mergeStyles(classNameStyle: ReactNativeStyle, style: unknown): unknown {
  if (style === undefined || style === null) return classNameStyle;
  return [classNameStyle, style];
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
    const { state } = useWindforge();
    const classNameStyle = className ? resolveClassNames(className, state) : {};
    return createElement(Component, {
      ...rest,
      style: mergeStyles(classNameStyle, style),
      ref,
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
