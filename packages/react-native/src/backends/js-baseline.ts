/**
 * js-baseline backend: resolve styles in JS and deliver them through React
 * props. Condition changes flow through the provider context, re-rendering
 * styled components — simple, dependency-free, and the parity reference for
 * other backends.
 */
import { resolveClassNames } from '../resolve.js';
import type { StyleBackend } from './types.js';

export function createJsBaselineBackend(): StyleBackend {
  return {
    name: 'js-baseline',
    requiresContext: () => true,
    resolveStyle: (className, state) => resolveClassNames(className, state),
  };
}
