/**
 * Tailwind v4 compile pipeline.
 *
 * entry CSS → `compile()` (resolves @import/@theme/@custom-variant, sets up
 * the design system) → `build(candidates)` → final CSS containing exactly the
 * utilities the scanner found.
 *
 * `prepareTailwindCompiler` stops before `build()` so callers can read
 * `compiler.sources` (the `@source` directives) and scan candidates with
 * Tailwind-native source discovery — `generate()` uses that ordering.
 */
import { compile } from '@tailwindcss/node';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { WINDFORGE_BUILTIN_CSS } from './builtins.js';
import type { Diagnostic } from './types.js';

type TailwindCompiler = Awaited<ReturnType<typeof compile>>;

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

export type PreparedCompiler = {
  /** `null` when the entry fails validation (WF1000) or compilation (WF1007). */
  compiler: TailwindCompiler | null;
  diagnostics: Diagnostic[];
};

/**
 * Compile an entry stylesheet into a Tailwind compiler without building the
 * final CSS yet. Exposes `compiler.sources` (`@source` directives, including
 * `@source not`) so the caller can discover candidate sources before calling
 * `compiler.build(candidates)` — the ordering the official Tailwind v4
 * tooling uses.
 *
 * Returns `compiler: null` (with a diagnostic) when the entry does not import
 * Tailwind — most likely a misconfigured `windforge.input`.
 */
export async function prepareTailwindCompiler(
  entryPath: string,
  options: CompileOptions = {},
): Promise<PreparedCompiler> {
  const entry = resolve(entryPath);
  const input = await readFile(entry, 'utf8');

  if (!input.includes('@import') || !/tailwindcss/.test(input)) {
    return {
      compiler: null,
      diagnostics: [
        {
          code: 'WF1000',
          message: `${entry} does not import Tailwind; add \`@import "tailwindcss";\``,
        },
      ],
    };
  }

  // Built-in Windforge utilities (Phase 15 safe-area classes) are injected
  // into every compilation; Tailwind only emits them when scanned as
  // candidates. Extension CSS (rendered by @windforge/extension-sdk) is
  // appended after the WF1000 check: that check validates the entry file
  // only, and injected blocks are position-insensitive
  // (@utility/@theme/@custom-variant).
  const source = `${input}\n${WINDFORGE_BUILTIN_CSS}${
    options.extraCss ? `\n${options.extraCss}` : ''
  }`;

  try {
    const compiler = await compile(source, {
      base: dirname(entry),
      from: entry,
      onDependency: options.onDependency ?? (() => {}),
    });
    return { compiler, diagnostics: [] };
  } catch (error) {
    // oxide throws plain Errors for malformed extension CSS (bad
    // @custom-variant/@utility). Surface them as diagnostics so a broken
    // extension degrades the build instead of crashing Metro startup.
    const message = error instanceof Error ? error.message : String(error);
    return {
      compiler: null,
      diagnostics: [{ code: 'WF1007', message: `Tailwind compilation failed: ${message}` }],
    };
  }
}

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
  const prepared = await prepareTailwindCompiler(entryPath, options);
  if (!prepared.compiler) {
    return { css: '', diagnostics: prepared.diagnostics };
  }
  return { css: prepared.compiler.build(candidates), diagnostics: [] };
}
