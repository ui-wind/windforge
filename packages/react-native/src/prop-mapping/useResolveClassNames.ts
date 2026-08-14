/**
 * `useResolveClassNames(className)` — resolve a className string into a
 * React Native style object outside of Windforge-wrapped components.
 *
 * Alias of `useWindforgeStyle` under the name other styling engines use
 * (`useResolveClassNames`), so migration guides translate one-to-one:
 *
 *   <ScrollView contentContainerStyle={useResolveClassNames('gap-3 p-6')} />
 */
export { useWindforgeStyle as useResolveClassNames } from './useWindforgeStyle.js';
