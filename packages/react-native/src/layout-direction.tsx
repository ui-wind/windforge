/**
 * Subtree layout-direction override (Phase 15 — parity with the Uniwind Pro
 * 1.4.0 `LayoutDirection` component).
 *
 *   <LayoutDirection direction="rtl">
 *     <View className="rtl:p-4 ltr:p-2" />
 *   </LayoutDirection>
 *
 * Flips the evaluation of `rtl:`/`ltr:` variants for every Windforge
 * component inside the subtree WITHOUT changing the device direction —
 * nearest provider wins when nested.
 *
 * Scope: the override affects JS-evaluated conditions (the native runtimes
 * and any backend that resolves through `resolveClassNames`). On the web
 * CSS-first backend `rtl:`/`ltr:` lower to CSS selectors the browser
 * evaluates, so there the DOM `dir` attribute is the mechanism instead.
 *
 * The override does not auto-flip styles: it only changes which direction
 * variants activate. Use logical utilities (`ms-*`/`me-*`/`ps-*`/`pe-*`)
 * for direction-aware spacing.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useConditionState } from './provider.js';
import type { ConditionState } from './state.js';

export type LayoutDirectionValue = 'ltr' | 'rtl';

/**
 * Apply a subtree layout-direction override to a condition state (Phase 15).
 * Pure and dependency-light so both the component render paths and
 * `useWindforgeStyle` can share it. Returns the SAME object when the
 * override is absent or already matches, so callers can detect activation
 * via identity (e.g. to skip native linking, which cannot see the override).
 */
export function overrideDirection(
  state: ConditionState,
  override: LayoutDirectionValue | null,
): ConditionState {
  if (override !== null && override !== state.layoutDirection) {
    return { ...state, layoutDirection: override };
  }
  return state;
}

const LayoutDirectionContext = createContext<LayoutDirectionValue | null>(null);

/**
 * Nearest subtree override, or null when the component inherits the device
 * direction. Internal plumbing for the resolution paths.
 */
export function useLayoutDirectionOverride(): LayoutDirectionValue | null {
  return useContext(LayoutDirectionContext);
}

export type LayoutDirectionProps = {
  direction: LayoutDirectionValue;
  children: ReactNode;
};

/** Force a layout direction for `rtl:`/`ltr:` variants inside a subtree. */
export function LayoutDirection(props: LayoutDirectionProps): ReactNode {
  return (
    <LayoutDirectionContext.Provider value={props.direction}>
      {props.children}
    </LayoutDirectionContext.Provider>
  );
}

/**
 * Effective layout direction for the calling component: the nearest
 * `<LayoutDirection>` override, else the device direction from the
 * condition state.
 */
export function useLayoutDirection(): LayoutDirectionValue {
  const override = useContext(LayoutDirectionContext);
  const state = useConditionState(false);
  return override ?? state.layoutDirection;
}
