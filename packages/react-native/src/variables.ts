/**
 * CSS-variable runtime APIs (Phase 12).
 *
 * - `updateCSSVariables(theme, vars)` — override CSS custom properties for a
 *   specific theme at runtime. Bumps the registry version so all style caches
 *   invalidate on next render. Per-theme isolation: overrides only apply when
 *   the current effective theme matches.
 * - `useCSSVariable(name)` — read a resolved variable value from the cascade
 *   (scoped → global overrides → artifact theme table). Subscribes to the
 *   ThemeStore so values update on theme change.
 *
 * The global overrides map is module-level state shared with the resolver via
 * `getGlobalOverrides()`. Resolution threads it through `ResolutionContext`.
 */
import { useSyncExternalStore } from 'react';
import { getThemeState, subscribeTheme } from './theme.js';
import { useScopedVariables, type VariableOverrides } from './scoped.js';
import { __bumpRegistryVersion, getArtifacts } from './registry.js';
import { tokensToString } from './token-print.js';

/** theme name → variable name → override value. */
const globalOverrides = new Map<string, Map<string, string>>();
let overridesGeneration = 0;

export function getGlobalOverrides(): Map<string, Map<string, string>> {
  return globalOverrides;
}

/**
 * Override CSS variables for a specific theme at runtime. Merges with any
 * prior overrides for that theme (later wins per variable name). Bumps the
 * registry version to invalidate style caches.
 */
export function updateCSSVariables(theme: string, vars: Record<string, string>): void {
  let themeMap = globalOverrides.get(theme);
  if (!themeMap) {
    themeMap = new Map();
    globalOverrides.set(theme, themeMap);
  }
  for (const [name, value] of Object.entries(vars)) {
    themeMap.set(name, value);
  }
  overridesGeneration += 1;
  __bumpRegistryVersion();
}

/**
 * Read the current value of a CSS variable from the resolution cascade:
 *   scoped overrides (nearest ScopedVariables provider) →
 *   global overrides[effectiveTheme] →
 *   artifact.themes[effectiveTheme].
 *
 * Subscribes to the ThemeStore so values update on theme change. Returns
 * undefined when no source provides the variable.
 */
/**
 * Read a CSS variable value outside of React components.
 * Same cascade as useCSSVariable but without subscription:
 *   global overrides[currentTheme] → artifact.themes[currentTheme or 'default'].
 *
 * Does NOT read scoped variables (no React context available outside
 * the component tree). Use in event handlers, async callbacks, utility
 * modules where useCSSVariable() cannot be called.
 */
export function getCSSVariable(name: string): string | undefined {
  // 1. Global overrides for the current theme.
  const theme = getThemeState().current;
  const globalVal = globalOverrides.get(theme)?.get(name);
  if (globalVal !== undefined) return globalVal;

  // 2. Artifact theme table — per-theme first, then base 'default'. A theme
  //    that exists but omits a variable falls back to the SAME artifact's
  //    default table (Phase 15 — deeply themed variables traverse both).
  const artifacts = getArtifacts();
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const themes = artifacts[i]?.themes;
    if (!themes) continue;
    const entry = themes[theme]?.find((e) => e.name === name);
    if (entry && Array.isArray(entry.tokens)) {
      const result = tokensToString(entry.tokens);
      if (result) return result;
    }
    if (theme !== 'default') {
      const fallback = themes['default']?.find((e) => e.name === name);
      if (fallback && Array.isArray(fallback.tokens)) {
        const result = tokensToString(fallback.tokens);
        if (result) return result;
      }
    }
  }

  return undefined;
}

export function useCSSVariable(name: string): string | undefined {
  // Subscribe to theme changes; the value itself comes from the resolver's
  // cascade, but we need re-renders when the active theme changes.
  useSyncExternalStore(subscribeTheme, getThemeState, getThemeState);
  const scopedVars = useScopedVariables();

  // 1. Scoped overrides.
  const scoped = scopedVars?.[name];
  if (scoped !== undefined) return scoped;

  // 2. Global overrides for the current theme.
  const theme = getThemeState().current;
  const globalVal = globalOverrides.get(theme)?.get(name);
  if (globalVal !== undefined) return globalVal;

  // 3. Artifact theme table — per-theme override first, then base @theme
  //    values stored under the "default" key by the compiler. Falls back
  //    to the same artifact's default table when the current theme omits
  //    the variable (Phase 15).
  const artifacts = getArtifacts();
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const themes = artifacts[i]?.themes;
    if (!themes) continue;
    const entry = themes[theme]?.find((e) => e.name === name);
    if (entry && Array.isArray(entry.tokens)) {
      const result = tokensToString(entry.tokens);
      if (result) return result;
    }
    if (theme !== 'default') {
      const fallback = themes['default']?.find((e) => e.name === name);
      if (fallback && Array.isArray(fallback.tokens)) {
        const result = tokensToString(fallback.tokens);
        if (result) return result;
      }
    }
  }

  return undefined;
}
