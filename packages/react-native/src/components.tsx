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
 *
 * Phase 11 — interaction: `data-*` props on any styled component feed
 * `data:` conditions (and are stripped like className). Interactive
 * components (Pressable, TextInput) are hand-written: they capture their own
 * pressed/hovered/focused/disabled state, evaluate `state:` conditions
 * against it, and publish it as a group provider when their className
 * carries a `group`/`group/<name>` marker. The native push path has no
 * channel for component state yet, so interactive components never link and
 * always resolve through React props.
 */
import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ElementType,
  type ForwardRefExoticComponent,
  type ReactElement,
  type Ref,
  type RefAttributes,
} from 'react';
import {
  Image as RNImage,
  Pressable as RNPressable,
  Text as RNText,
  TextInput as RNTextInput,
  View as RNView,
  findNodeHandle,
} from 'react-native';
import { getBackend } from './backends/index.js';
import {
  GroupContext,
  groupNamesIn,
  mergeGroupStates,
  useGroupStates,
  type GroupStates,
} from './group.js';
import { useConditionState } from './provider.js';
import {
  overrideDirection,
  useLayoutDirectionOverride,
} from './layout-direction.js';
import type { ClassPropMapping } from './prop-mapping/registry.js';
import { getArtifacts } from './registry.js';
import type { ReactNativeStyle, ResolutionContext } from './resolve.js';
import { useScopedTheme, useScopedVariables } from './scoped.js';
import { getGlobalOverrides } from './variables.js';
import type { ComponentState, ConditionState } from './state.js';

export type StyledProps = {
  className?: string;
} & {
  /** `data-*` props feed `data:` conditions (Phase 11); styling inputs only,
   * never forwarded to the host. */
  [key: `data-${string}`]: string | number | boolean | null | undefined;
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

/**
 * Extract `data-*` props into a ComponentState.data snapshot; returns the
 * remaining props. Data props are styling inputs, not host props — they are
 * stripped like className. Null/undefined values and non-primitive values
 * are not forwarded (presence semantics require a defined primitive).
 */
function extractDataProps(props: Record<string, unknown>): {
  data: ComponentState['data'] | undefined;
  rest: Record<string, unknown>;
} {
  let data: ComponentState['data'] | undefined;
  let rest = props;
  for (const key of Object.keys(props)) {
    if (!key.startsWith('data-')) continue;
    const value = props[key];
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      continue;
    }
    data ??= {};
    data[key.slice('data-'.length)] = value;
    if (rest === props) rest = { ...props };
    delete rest[key];
  }
  return { data, rest };
}

/**
 * True when the class string declares `state:`/`data:` condition
 * dependencies — its resolved style depends on component state, which the
 * native push path cannot see (no interaction channel yet). Absent
 * dependency data (legacy artifact), assume yes.
 */
function requiresComponentState(className: string): boolean {
  let sawDependencies = false;
  for (const artifact of getArtifacts()) {
    if (!artifact.dependencies) continue;
    sawDependencies = true;
    for (const token of className.split(/\s+/)) {
      const ids = artifact.dependencies[token];
      if (!ids) continue;
      if (ids.some((id) => id.startsWith('state:') || id.startsWith('data:'))) {
        return true;
      }
    }
  }
  return !sawDependencies;
}

const PRIMARY_MAPPING: ClassPropMapping[] = [
  { classNameProp: 'className', styleProp: 'style' },
];

/** Build the Phase 12 variable resolution context from scoped theme/vars. */
function useThemeContext(state: ConditionState): ResolutionContext | undefined {
  const scopedTheme = useScopedTheme();
  const scopedVars = useScopedVariables();
  const effectiveTheme = scopedTheme ?? state.theme;
  if (!scopedTheme && !scopedVars) return undefined;
  return {
    theme: effectiveTheme,
    scopedVars: scopedVars ?? null,
    globalOverrides: getGlobalOverrides(),
  };
}

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
    // Phase 15 — a subtree <LayoutDirection> override flips `rtl:`/`ltr:`
    // evaluation. It lives in React context, so resolution must happen in
    // JS (the native link path reads the provider store only); when an
    // override is present we always subscribe to condition changes.
    const directionOverride = useLayoutDirectionOverride();
    // Only backends that deliver through React props need to re-render on
    // condition changes; subscribing=false keeps the snapshot without it.
    // Non-linkable mappings (secondary style surfaces) always subscribe —
    // the native protocol cannot deliver them.
    const subscribe =
      directionOverride !== null ? true : linkable ? backend.requiresContext() : true;
    const globalState = useConditionState(subscribe);
    // Same object identity when no override changes the effective direction.
    const state = overrideDirection(globalState, directionOverride);
    // Group context flows into componentState: styled descendants evaluate
    // `group-*` conditions against the nearest providers. Consuming the
    // context is also the JS delivery path — provider state changes
    // re-render this component on every backend.
    const groupStates = useGroupStates();
    // Phase 12 — scoped theme and variable overrides for resolution.
    const themeCtx = useThemeContext(state);

    const { data, rest: dataRest } = extractDataProps(props as Record<string, unknown>);

    let componentState: ComponentState | undefined;
    if (data || groupStates) {
      componentState = {};
      if (data) componentState.data = data;
      if (groupStates) componentState.groups = groupStates;
    }

    const resolved: Record<string, unknown> = {};
    let primaryClassName: string | undefined;
    for (const mapping of mappings) {
      const className = dataRest[mapping.classNameProp];
      if (typeof className !== 'string' || !className) continue;
      if (mapping.classNameProp === 'className') primaryClassName = className;
      resolved[mapping.styleProp] = mergeStyles(
        backend.resolveStyle(className, state, componentState, themeCtx),
        dataRest[mapping.styleProp],
      );
    }

    // Native delivery resolves without component state: skip linking when
    // this component carries data props or its classes depend on group
    // state — those resolve through React props instead. Also skip linking
    // when a subtree layout-direction override is active (state !==
    // globalState): the native path evaluates conditions from the provider
    // store and cannot see the JS-level override, so resolve in JS.
    const linkEligible =
      linkable &&
      state === globalState &&
      data === undefined &&
      !(
        groupStates !== null &&
        primaryClassName !== undefined &&
        requiresComponentState(primaryClassName)
      );

    const hostRef = useRef<unknown>(null);
    const setHostRef = useCallback(
      (instance: unknown) => {
        hostRef.current = instance;
        applyRef(ref, instance);
      },
      [ref],
    );

    useEffect(() => {
      if (!linkEligible || !primaryClassName || backend.link === undefined) return undefined;
      const handle = hostHandleOf(hostRef.current);
      if (handle === null) return undefined;
      backend.link(handle, primaryClassName, state);
      return () => backend.unlink?.(handle);
      // `state` is only read as a fallback snapshot by the fabric backend
      // (its live state comes from the provider's condition store), and it
      // never changes while the component is unsubscribed.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [backend, linkEligible, primaryClassName]);

    // className props are Windforge-only; never forward them to the host.
    const rest: Record<string, unknown> = { ...dataRest };
    for (const mapping of mappings) delete rest[mapping.classNameProp];

    return createElement(Component, {
      ...rest,
      ...resolved,
      ref: linkEligible && backend.link ? setHostRef : ref,
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

/**
 * Shared plumbing for the hand-written interactive components: always
 * subscribes (interaction styles ride React props until the native channel
 * lands), builds the componentState snapshot, and computes the group
 * provider value (nearest-wins merge over ancestor groups).
 */
function useInteractiveState(options: {
  className?: string | undefined;
  pressed?: boolean;
  hovered?: boolean;
  focused?: boolean;
  disabled?: boolean;
  data?: ComponentState['data'] | undefined;
}): {
  state: ConditionState;
  componentState: ComponentState;
  groupNames: string[];
  providedGroups: GroupStates | null;
  themeCtx: ResolutionContext | undefined;
} {
  const {
    className,
    pressed = false,
    hovered = false,
    focused = false,
    disabled = false,
    data,
  } = options;
  const state = useConditionState(true);
  const directionOverride = useLayoutDirectionOverride();
  // Subtree layout-direction override (Phase 15) — same identity when inactive.
  const effectiveState = overrideDirection(state, directionOverride);
  const groupStates = useGroupStates();
  const themeCtx = useThemeContext(effectiveState);
  const componentState = useMemo<ComponentState>(
    () => ({
      pressed,
      hovered,
      focused,
      ...(disabled && { disabled: true }),
      ...(data && { data }),
      ...(groupStates && { groups: groupStates }),
    }),
    [pressed, hovered, focused, disabled, data, groupStates],
  );
  const groupNames = useMemo(() => groupNamesIn(className), [className]);
  const providedGroups = useMemo(
    () => mergeGroupStates(groupStates, groupNames, { pressed, hovered, focused, disabled }),
    [groupStates, groupNames, pressed, hovered, focused, disabled],
  );
  return {
    state: effectiveState,
    componentState,
    groupNames,
    providedGroups,
    themeCtx,
  };
}

/** Wrap the host element in a group provider when a marker is present. */
function withGroupProvider(
  element: ReactElement,
  groupNames: string[],
  providedGroups: GroupStates | null,
): ReactElement {
  if (groupNames.length === 0) return element;
  return createElement(GroupContext.Provider, { value: providedGroups }, element);
}

export type ViewProps = ComponentProps<typeof RNView> & StyledProps;
export type TextProps = ComponentProps<typeof RNText> & StyledProps;
export type ImageProps = ComponentProps<typeof RNImage> & StyledProps;
export type PressableProps = ComponentProps<typeof RNPressable> & StyledProps;
export type TextInputProps = ComponentProps<typeof RNTextInput> & StyledProps;

type PressHandlerEvent = Parameters<NonNullable<PressableProps['onPressIn']>>[0];
type HoverHandlerEvent = Parameters<NonNullable<PressableProps['onHoverIn']>>[0];
type PressableFocusEvent = Parameters<NonNullable<PressableProps['onFocus']>>[0];
type TextInputFocusEvent = Parameters<NonNullable<TextInputProps['onFocus']>>[0];

export const View: ForwardRefExoticComponent<ViewProps & RefAttributes<unknown>> = createStyledComponent<ViewProps>(RNView, 'View');
export const Text: ForwardRefExoticComponent<TextProps & RefAttributes<unknown>> = createStyledComponent<TextProps>(RNText, 'Text');
export const Image: ForwardRefExoticComponent<ImageProps & RefAttributes<unknown>> = createStyledComponent<ImageProps>(RNImage, 'Image');

/**
 * Interactive Pressable: captures pressed/hovered/focused/disabled from its
 * own events and evaluates `hover:`/`active:`/`focus:`/`disabled:` variants
 * against them. Carrying a `group`/`group/<name>` marker publishes that
 * state to styled descendants (`group-hover:` and friends).
 */
export const Pressable = forwardRef<unknown, PressableProps>(function Pressable(
  props,
  ref: Ref<unknown>,
) {
  const {
    className,
    style,
    disabled,
    onPressIn,
    onPressOut,
    onHoverIn,
    onHoverOut,
    onFocus,
    onBlur,
    ...rest
  } = props;
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const backend = getBackend();
  const { data, rest: forwarded } = extractDataProps(rest as Record<string, unknown>);
  const { state, componentState, groupNames, providedGroups, themeCtx } = useInteractiveState({
    className,
    pressed,
    hovered,
    focused,
    disabled: disabled === true,
    data,
  });

  const resolved = mergeStyles(backend.resolveStyle(className ?? '', state, componentState, themeCtx), style);

  const hostProps: Record<string, unknown> = {
    ...forwarded,
    style: resolved,
    disabled,
    onPressIn: (event: PressHandlerEvent) => {
      setPressed(true);
      onPressIn?.(event);
    },
    onPressOut: (event: PressHandlerEvent) => {
      setPressed(false);
      onPressOut?.(event);
    },
    onHoverIn: (event: HoverHandlerEvent) => {
      setHovered(true);
      onHoverIn?.(event);
    },
    onHoverOut: (event: HoverHandlerEvent) => {
      setHovered(false);
      onHoverOut?.(event);
    },
    onFocus: (event: PressableFocusEvent) => {
      setFocused(true);
      onFocus?.(event);
    },
    onBlur: (event: PressableFocusEvent) => {
      setFocused(false);
      onBlur?.(event);
    },
    ref,
  };
  const element = createElement(
    RNPressable,
    hostProps as ComponentProps<typeof RNPressable>,
  );
  return withGroupProvider(element, groupNames, providedGroups);
});
Pressable.displayName = 'WindforgePressable';

/**
 * Interactive TextInput: captures focus/blur and treats `editable={false}`
 * as disabled, evaluating `focus:`/`disabled:` variants against them. Group
 * markers publish the same state to descendants (`group-focus:` …).
 */
export const TextInput = forwardRef<unknown, TextInputProps>(function TextInput(
  props,
  ref: Ref<unknown>,
) {
  const { className, style, editable, onFocus, onBlur, ...rest } = props;
  const [focused, setFocused] = useState(false);
  const backend = getBackend();
  const { data, rest: forwarded } = extractDataProps(rest as Record<string, unknown>);
  const { state, componentState, groupNames, providedGroups, themeCtx } = useInteractiveState({
    className,
    focused,
    disabled: editable === false,
    data,
  });

  const resolved = mergeStyles(backend.resolveStyle(className ?? '', state, componentState, themeCtx), style);

  const hostProps: Record<string, unknown> = {
    ...forwarded,
    style: resolved,
    editable,
    onFocus: (event: TextInputFocusEvent) => {
      setFocused(true);
      onFocus?.(event);
    },
    onBlur: (event: TextInputFocusEvent) => {
      setFocused(false);
      onBlur?.(event);
    },
    ref,
  };
  const element = createElement(
    RNTextInput,
    hostProps as ComponentProps<typeof RNTextInput>,
  );
  return withGroupProvider(element, groupNames, providedGroups);
});
TextInput.displayName = 'WindforgeTextInput';
