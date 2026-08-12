/**
 * Tailwind v4 compile pipeline.
 *
 * entry CSS → `compile()` (resolves @import/@theme/@custom-variant, sets up
 * the design system) → `build(candidates)` → final CSS containing exactly the
 * utilities the scanner found.
 */
import { compile } from '@tailwindcss/node';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Diagnostic } from './types.js';

export type CompileOptions = {
  /** Called for each @import/@plugin dependency so watch mode can track them. */
  onDependency?: (path: string) => void;
};

export type CompileResult = {
  css: string;
  diagnostics: Diagnostic[];
};

/**
 * Compile an entry stylesheet for the given candidates.
 *
 * Returns empty CSS (with a diagnostic) when the entry does not import
 * Tailwind — most likely a misconfigured `windforge.input`.
 */
export async function compileTailwindCss(
  entryPath: string,
  candidates: string[],
  options: CompileOptions = {},
): Promise<CompileResult> {
  const entry = resolve(entryPath);
  const input = await readFile(entry, 'utf8');

  if (!input.includes('@import') || !/tailwindcss/.test(input)) {
    return {
      css: '',
      diagnostics: [
        {
          code: 'WF1000',
          message: `${entry} does not import Tailwind; add \`@import "tailwindcss";\``,
        },
      ],
    };
  }

  const compiler = await compile(input, {
    base: dirname(entry),
    from: entry,
    onDependency: options.onDependency ?? (() => {}),
  });
  return { css: compiler.build(candidates), diagnostics: [] };
}
