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
import { __bumpRegistryVersion } from './registry.js';

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

  // 3. Artifact theme table.
  // Imported lazily to avoid circular deps at module init time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getArtifacts } = require('./registry.js') as {
    getArtifacts: () => readonly import('./types.js').RuntimeArtifact[];
  };
  const artifacts = getArtifacts();
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const entries = artifacts[i]?.themes?.[theme];
    if (!entries) continue;
    const entry = entries.find((e) => e.name === name);
    if (entry && Array.isArray(entry.tokens)) {
      // Extract scalar value from serialized token array.
      const parts: string[] = [];
      for (const raw of entry.tokens) {
        const token = raw as { type?: string; value?: unknown };
        if (!token || typeof token.type !== 'string') continue;
        if (token.type === 'white-space') continue;
        parts.push(String(token.value ?? ''));
      }
      const result = parts.join('').trim();
      if (result) return result;
    }
  }

  return undefined;
}
