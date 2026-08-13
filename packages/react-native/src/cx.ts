/**
 * Conditional class composition.
 *
 * `cx` merges string/boolean/array/object inputs into one whitespace-
 * normalized className string, so conditional expressions stay at the call
 * site:
 *
 *   <View className={cx('rounded-lg p-4', active && 'bg-emerald-500', { 'opacity-50': disabled })} />
 *
 * Output is trimmed and single-space separated — the same normalization the
 * fabric backend applies to protocol keys, so composed strings resolve and
 * link consistently. Ternaries are just JavaScript and need no helper:
 * `className={active ? 'bg-accent' : 'bg-zinc-800'}`.
 */

export type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ClassValue[]
  | { [className: string]: boolean | null | undefined };

function collect(input: ClassValue, out: string[]): void {
  if (input === null || input === undefined || input === false || input === true) return;
  if (typeof input === 'string' || typeof input === 'number') {
    const text = String(input).trim();
    if (text) out.push(text);
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) collect(item, out);
    return;
  }
  for (const [className, enabled] of Object.entries(input)) {
    if (enabled) collect(className, out);
  }
}

/** Compose className values; falsy entries are dropped, whitespace normalized. */
export function cx(...inputs: ClassValue[]): string {
  const parts: string[] = [];
  for (const input of inputs) collect(input, parts);
  return parts.join(' ').split(/\s+/).filter(Boolean).join(' ');
}

/** Alias of {@link cx}. */
export const cn = cx;
