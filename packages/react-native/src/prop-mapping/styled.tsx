/**
 * `styled(Component)` — className support for components Windforge does not
 * wrap: third-party components, RN containers with secondary style surfaces,
 * or any component exposing `{..., style}`-shaped props.
 *
 *   const StyledList = styled(FlatList);
 *   // or with explicit mappings:
 *   const StyledCard = styled(Card, [{ classNameProp: 'cardClassName', styleProp: 'cardStyle' }]);
 *
 * Without explicit mappings the component registry is consulted
 * (`registerComponent`), falling back to the plain `className → style` pair.
 * Native delivery links only the primary mapping (see components.tsx);
 * secondary surfaces update through React re-renders.
 */
import type { ElementType, ForwardRefExoticComponent, RefAttributes } from 'react';
import { createStyledElement, type StyledProps } from '../components.js';
import { getComponentMapping, toMappings, type ClassPropMapping } from './registry.js';

const DEFAULT_MAPPINGS: ClassPropMapping[] = [
  { classNameProp: 'className', styleProp: 'style' },
];

function displayNameOf(component: ElementType): string {
  const named = component as { displayName?: string; name?: string };
  return named.displayName || named.name || 'Component';
}

/** Wrap a component with Windforge className resolution. */
export function styled<Props extends object>(
  Component: ElementType,
  mappings?: ClassPropMapping[],
): ForwardRefExoticComponent<Props & StyledProps & RefAttributes<unknown>> {
  const record = mappings === undefined ? getComponentMapping(Component) : undefined;
  const resolvedMappings = mappings ?? (record ? toMappings(record) : DEFAULT_MAPPINGS);
  return createStyledElement<Props>(
    Component,
    displayNameOf(Component),
    resolvedMappings,
  ) as ForwardRefExoticComponent<Props & StyledProps & RefAttributes<unknown>>;
}
