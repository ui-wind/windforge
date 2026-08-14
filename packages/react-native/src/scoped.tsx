/**
 * Scoped theme and variable overrides (Phase 12).
 *
 * Mirrors the group.tsx nearest-wins pattern: a subtree may override the
 * active theme (ScopedTheme) and/or shadow individual CSS variables
 * (ScopedVariables). Resolution reads the nearest provider and falls back
 * toward the root; nested providers merge per variable name.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';

/** Theme-name override for a subtree; null when no provider is present. */
export const ScopedThemeContext = createContext<string | null>(null);

/** Theme name in effect for this subtree, or null (use the global theme). */
export function useScopedTheme(): string | null {
  return useContext(ScopedThemeContext);
}

export type ScopedThemeProps = {
  /** Theme name to apply to this subtree (e.g. `'ocean'`). */
  name: string;
  children: ReactNode;
};

export function ScopedTheme(props: ScopedThemeProps): ReactNode {
  const { name, children } = props;
  return (
    <ScopedThemeContext.Provider value={name}>{children}</ScopedThemeContext.Provider>
  );
}

/** CSS-variable overrides keyed by variable name (with leading `--`). */
export type VariableOverrides = Record<string, string>;

/** Variable overrides for a subtree; null when no provider is present. */
export const ScopedVariablesContext = createContext<VariableOverrides | null>(null);

/** Variable overrides in effect for this subtree, or null. */
export function useScopedVariables(): VariableOverrides | null {
  return useContext(ScopedVariablesContext);
}

export type ScopedVariablesProps = {
  /** Variables to shadow in this subtree; nearest wins per name. */
  variables: VariableOverrides;
  children: ReactNode;
};

export function ScopedVariables(props: ScopedVariablesProps): ReactNode {
  const { variables, children } = props;
  const ancestor = useContext(ScopedVariablesContext);
  // Merge with the ancestor: this provider's values win per variable name.
  const merged = useMemo<VariableOverrides>(
    () => ({ ...(ancestor ?? {}), ...variables }),
    [ancestor, variables],
  );
  return (
    <ScopedVariablesContext.Provider value={merged}>
      {children}
    </ScopedVariablesContext.Provider>
  );
}
