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
  /**
   * CSS text appended to the entry source before Tailwind compilation (e.g.
   * `@utility`/`@theme`/`@custom-variant` blocks rendered by
   * @windforge/extension-sdk). Must not contain `@import` rules.
   */
  extraCss?: string;
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

  // Extension CSS (rendered by @windforge/extension-sdk) is appended after the
  // WF1000 check: that check validates the entry file only, and injected
  // blocks are position-insensitive (@utility/@theme/@custom-variant).
  const source = options.extraCss ? `${input}\n${options.extraCss}` : input;

  try {
    const compiler = await compile(source, {
      base: dirname(entry),
      from: entry,
      onDependency: options.onDependency ?? (() => {}),
    });
    return { css: compiler.build(candidates), diagnostics: [] };
  } catch (error) {
    // oxide throws plain Errors for malformed extension CSS (bad
    // @custom-variant/@utility). Surface them as diagnostics so a broken
    // extension degrades the build instead of crashing Metro startup.
    const message = error instanceof Error ? error.message : String(error);
    return {
      css: '',
      diagnostics: [{ code: 'WF1007', message: `Tailwind compilation failed: ${message}` }],
    };
  }
}
