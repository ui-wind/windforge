/**
 * Group propagation for `group-hover:` / `group-active:` / … variants.
 *
 * Interactive components (Pressable, TextInput) carrying a `group` or
 * `group/<name>` marker in their className publish their interaction state
 * through React context; styled descendants consume it when evaluating
 * group-* conditions. Nearest provider wins per group name; named and
 * anonymous groups coexist independently. Non-interactive components never
 * publish — a `group` marker on a plain View adds no state to shadow.
 */
import { createContext, useContext } from 'react';
import type { GroupInteractionState } from './state.js';

/** Group name → interaction state of the nearest provider for that name
 * (`''` = anonymous `group`). */
export type GroupStates = Record<string, GroupInteractionState>;

export const GroupContext = createContext<GroupStates | null>(null);

/** Interaction states of all ancestor group providers; null when none. */
export function useGroupStates(): GroupStates | null {
  return useContext(GroupContext);
}

/**
 * Group marker tokens in a className string: `group` (anonymous) and
 * `group/<name>` (named). Variant tokens like `group-hover:bg-x` are not
 * markers.
 */
export function groupNamesIn(className: string | undefined): string[] {
  if (!className) return [];
  const names: string[] = [];
  for (const token of className.split(/\s+/)) {
    if (token === 'group') names.push('');
    else if (token.startsWith('group/') && !token.includes(':')) {
      names.push(token.slice('group/'.length));
    }
  }
  return names;
}

/** Overlay this provider's state on the ancestor states (nearest wins per
 * name). Returns the ancestor object unchanged when no marker is present. */
export function mergeGroupStates(
  ancestor: GroupStates | null,
  names: string[],
  own: GroupInteractionState,
): GroupStates | null {
  if (names.length === 0) return ancestor;
  const merged: GroupStates = { ...(ancestor ?? {}) };
  for (const name of names) merged[name] = own;
  return merged;
}
