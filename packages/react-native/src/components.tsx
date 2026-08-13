/**
 * Styled components: thin wrappers over React Native primitives that resolve
 * `className` through the active StyleBackend. The wrapped component accepts
 * both `className` and `style`; `style` wins on conflicts (escape hatch).
 *
 * js-baseline: components subscribe to condition state and re-render on
 * change (traditional behavior). fabric: components read the snapshot
 * without subscribing — condition updates are delivered natively via the
 * delivery protocol, and mount/unmount link the host node to its className.
 *
 * `createStyledElement` is the generalized factory shared by the primitives
 * below and by `styled()` (prop-mapping). Native delivery can only bind ONE
 * className string per host node, so linking (and the no-re-render
 * subscription mode) applies only to components whose single mapping is the
 * primary `className → style` pair; components with secondary surfaces
 * (e.g. `contentContainerClassName`) subscribe and re-render instead.
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
import type { ClassPropMapping } from './prop-mapping/registry.js';
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

const PRIMARY_MAPPING: ClassPropMapping[] = [
  { classNameProp: 'className', styleProp: 'style' },
];

/** The primary `className → style` pair, linkable through the native protocol. */
function isLinkable(mappings: ClassPropMapping[]): boolean {
  return (
    mappings.length === 1 &&
    mappings[0]?.classNameProp === 'className' &&
    mappings[0]?.styleProp === 'style'
  );
}

/**
 * Generalized styled-component factory. Resolves every mapping's className
 * prop through the backend and merges it into the matching style prop (user
 * style wins). See the module note on linking and subscription rules.
 */
export function createStyledElement<Props extends object>(
  Component: ElementType,
  displayName: string,
  mappings: ClassPropMapping[],
) {
  const linkable = isLinkable(mappings);

  const Styled = forwardRef<unknown, Props & StyledProps>(function StyledComponent(
    props,
    ref: Ref<unknown>,
  ) {
    const backend = getBackend();
    // Only backends that deliver through React props need to re-render on
    // condition changes; subscribing=false keeps the snapshot without it.
    // Non-linkable mappings (secondary style surfaces) always subscribe —
    // the native protocol cannot deliver them.
    const state = useConditionState(linkable ? backend.requiresContext() : true);

    const resolved: Record<string, unknown> = {};
    let primaryClassName: string | undefined;
    for (const mapping of mappings) {
      const className = (props as Record<string, unknown>)[mapping.classNameProp];
      if (typeof className !== 'string' || !className) continue;
      if (mapping.classNameProp === 'className') primaryClassName = className;
      resolved[mapping.styleProp] = mergeStyles(
        backend.resolveStyle(className, state),
        (props as Record<string, unknown>)[mapping.styleProp],
      );
    }

    const hostRef = useRef<unknown>(null);
    const setHostRef = useCallback(
      (instance: unknown) => {
        hostRef.current = instance;
        applyRef(ref, instance);
      },
      [ref],
    );

    useEffect(() => {
      if (!linkable || !primaryClassName || backend.link === undefined) return undefined;
      const handle = hostHandleOf(hostRef.current);
      if (handle === null) return undefined;
      backend.link(handle, primaryClassName, state);
      return () => backend.unlink?.(handle);
      // `state` is only read as a fallback snapshot by the fabric backend
      // (its live state comes from the provider's condition store), and it
      // never changes while the component is unsubscribed.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [backend, linkable, primaryClassName]);

    // className props are Windforge-only; never forward them to the host.
    const rest: Record<string, unknown> = { ...props };
    for (const mapping of mappings) delete rest[mapping.classNameProp];

    return createElement(Component, {
      ...rest,
      ...resolved,
      ref: linkable && backend.link ? setHostRef : ref,
    });
  });
  Styled.displayName = `Windforge${displayName}`;
  return Styled;
}

function createStyledComponent<Props extends { style?: unknown }>(
  Component: ElementType,
  displayName: string,
) {
  return createStyledElement<Props>(Component, displayName, PRIMARY_MAPPING);
}

export type ViewProps = ComponentProps<typeof RNView> & StyledProps;
export type TextProps = ComponentProps<typeof RNText> & StyledProps;
export type ImageProps = ComponentProps<typeof RNImage> & StyledProps;
export type PressableProps = ComponentProps<typeof RNPressable> & StyledProps;

export const View = createStyledComponent<ViewProps>(RNView, 'View');
export const Text = createStyledComponent<TextProps>(RNText, 'Text');
export const Image = createStyledComponent<ImageProps>(RNImage, 'Image');
export const Pressable = createStyledComponent<PressableProps>(RNPressable, 'Pressable');
