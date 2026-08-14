/**
 * Web CSS backend (Phase 13).
 *
 * On web, styles arrive as a real CSS stylesheet (emitted by the Vite plugin
 * or the Metro web split) rather than as resolved React Native objects. The
 * browser evaluates pseudo-class and media selectors natively, so this
 * backend does NOT re-resolve the IR in JS. It passes the className string
 * through so React Native Web stamps it onto the DOM element, and lets CSS
 * do the work.
 *
 * What still needs runtime gating on web is limited to conditions CSS can't
 * express against the current app state:
 *  - `platform: native` rules are already absent from the web CSS build
 *    (the compiler filters them when lowering for web).
 *  - `theme:<name>` variants use `.themeName` descendant scoping in the
 *    stylesheet; activating a theme on web = adding the `.themeName` class
 *    to a root element. The backend therefore keeps a subscription so
 *    components re-render when the effective theme changes and can re-apply
 *    the scoping class.
 *
 * `resolveStyle` returns `{ className }` carrying the full token string
 * unchanged. Components forward this to the host element's `className` prop;
 * React Native Web applies it directly to the DOM node. When no tokens are
 * present an empty object is returned so no stray attribute is emitted.
 */
import type { StyleBackend } from './types.js';

export function createWebCssBackend(): StyleBackend {
  return {
    name: 'web-css',
    // Theme scoping still rides React state on web (adding/removing the
    // `.themeName` root class), so components subscribe and re-render on
    // theme change. Hover/focus/active/media are pure CSS and do not
    // require re-renders.
    requiresContext: () => true,
    resolveStyle(className) {
      const trimmed = className.trim();
      if (!trimmed) return {};
      return { className: trimmed };
    },
  };
}
