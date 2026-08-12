/**
 * StyleBackend: the delivery boundary between the Windforge runtime and a
 * platform update strategy.
 *
 * - `js-baseline` resolves styles in JS and lets React re-render the tree on
 *   condition changes. It is the default, the fallback, and the web parity
 *   reference.
 * - `fabric` delivers condition-driven updates through the native delivery
 *   protocol (docs/specs/NATIVE_DELIVERY_PROTOCOL_SPEC.md): JS observes
 *   conditions and diffs unique classNames, native merges them into Fabric
 *   commits. Styled components do not re-render on condition changes while
 *   the native path is active.
 *
 * Backends must not import Fabric types (architecture §14); the fabric
 * backend talks to native only through its adapter interface.
 */
import type { ReactNativeStyle } from '../resolve.js';
import type { ConditionState } from '../state.js';

export type StyleBackendName = 'js-baseline' | 'fabric';

/** Opaque native handle for a mounted host node (Fabric tag in production). */
export type StyleHandle = number;

export interface StyleBackend {
  readonly name: StyleBackendName;
  /**
   * Whether styled components must consume the provider context (and thus
   * re-render on condition changes). `js-baseline` does; `fabric` does not
   * while its native adapter is available.
   */
  requiresContext(): boolean;
  /** Resolve a className string for the given condition state. */
  resolveStyle(className: string, state: ConditionState): ReactNativeStyle;
  /** Bind a mounted host node to a className (native delivery only). */
  link?(handle: StyleHandle, className: string, state: ConditionState): void;
  /** Remove a binding on unmount. */
  unlink?(handle: StyleHandle): void;
  /**
   * Observe a condition change (color scheme, dimensions). The backend
   * decides what changed and pushes it; components are not re-rendered.
   */
  onConditionsChanged?(next: ConditionState, prev: ConditionState): void;
}
