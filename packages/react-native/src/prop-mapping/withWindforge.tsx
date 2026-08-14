/**
 * `withWindforge(Component)` — HOC form of `styled()` for components
 * Windforge does not wrap natively. Same behavior and mapping rules as
 * `styled()`; the HOC name matches the naming convention used by other
 * styling engines (`withUniwind`), so adoption docs read naturally:
 *
 *   const StyledList = withWindforge(FlatList);
 *   const StyledCard = withWindforge(Card, [{ classNameProp: 'cardClassName', styleProp: 'cardStyle' }]);
 */
import type { ElementType, ForwardRefExoticComponent, RefAttributes } from 'react';
import type { StyledProps } from '../components.js';
import type { ClassPropMapping } from './registry.js';
import { styled } from './styled.js';

/** Wrap a component with Windforge className resolution (HOC form). */
export function withWindforge<Props extends object>(
  Component: ElementType,
  mappings?: ClassPropMapping[],
): ForwardRefExoticComponent<Props & StyledProps & RefAttributes<unknown>> {
  return styled<Props>(Component, mappings);
}
