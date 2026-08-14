/**
 * Canonical style property names.
 *
 * The IR uses canonical property names, never frontend syntax. `p-4` must be
 * lowered to `padding` before entering the IR. Property names are
 * platform-neutral: backends decide how each canonical property is lowered
 * (RN style key, CSS property, etc.).
 */
export type CanonicalProperty = string;

/**
 * The core set of canonical properties the IR expects today. This list grows
 * with the parity matrix; it is a validation aid, not a closed enum — the IR
 * itself accepts any string so backends can extend without a core release.
 */
export const KNOWN_CANONICAL_PROPERTIES = [
  // layout
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'start',
  'end',
  'inset',
  'insetBlock',
  'insetInline',
  'insetInlineStart',
  'insetInlineEnd',
  'zIndex',
  'flex',
  'flexDirection',
  'flexWrap',
  'flexBasis',
  'flexGrow',
  'flexShrink',
  'alignContent',
  'alignItems',
  'alignSelf',
  'justifyContent',
  'gap',
  'rowGap',
  'columnGap',
  // box model
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'aspectRatio',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginBlock',
  'marginInline',
  'marginInlineStart',
  'marginInlineEnd',
  'marginHorizontal',
  'marginVertical',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingBlock',
  'paddingInline',
  'paddingInlineStart',
  'paddingInlineEnd',
  'paddingHorizontal',
  'paddingVertical',
  'overflow',
  // borders
  'borderWidth',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderColor',
  'borderStyle',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  // paint
  'backgroundColor',
  'color',
  'opacity',
  'shadowColor',
  'shadowOffset',
  'shadowOpacity',
  'shadowRadius',
  'elevation',
  // typography
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textDecorationLine',
  'textTransform',
  // transform
  'transform',
] as const;

const KNOWN_SET: ReadonlySet<string> = new Set(KNOWN_CANONICAL_PROPERTIES);

/** True when the property is part of the known canonical set. */
export function isKnownCanonicalProperty(property: string): boolean {
  return KNOWN_SET.has(property);
}
