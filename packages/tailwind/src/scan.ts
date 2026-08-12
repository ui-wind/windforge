/**
 * Candidate extraction via the Tailwind oxide scanner.
 */
import { Scanner } from '@tailwindcss/oxide';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

export type ScanSource = {
  /** Directory the glob pattern resolves against. */
  base: string;
  /** Glob pattern, e.g. "./src/" followed by "*.{ts,tsx}". */
  pattern: string;
};

/** Default patterns: app code only. Node/binary trees are never scanned. */
export function defaultSources(base: string): ScanSource[] {
  return [
    { base, pattern: './app/**/*.{ts,tsx,js,jsx}' },
    { base, pattern: './src/**/*.{ts,tsx,js,jsx}' },
    { base, pattern: './components/**/*.{ts,tsx,js,jsx}' },
  ];
}

export type ScanOptions = {
  /** Extra candidate sources beyond `defaultSources(base)`. */
  sources?: ScanSource[];
};

/**
 * Scan source files and return the list of class candidates used in them.
 * Deterministic for a given file set: the oxide scanner sorts results.
 */
export function scanCandidates(base: string, options: ScanOptions = {}): string[] {
  const sources = [...defaultSources(base), ...(options.sources ?? [])];
  const scanner = new Scanner({
    sources: sources.map((source) => ({
      base: source.base,
      pattern: source.pattern,
      negated: false,
    })),
  });
  return scanner.scan();
}

/**
 * Scan explicit files (watch-mode incremental rebuilds). Content can be
 * passed directly to avoid disk reads on dirty buffers.
 */
export function scanFiles(
  files: Array<{ file: string; content?: string }>,
): string[] {
  const scanner = new Scanner({ sources: [] });
  return scanner.scanFiles(
    files.map((entry) => {
      const extension = extname(entry.file).slice(1);
      if (entry.content !== undefined) {
        return { content: entry.content, extension };
      }
      return { file: entry.file, extension };
    }),
  );
}

/** Read candidates from an explicit file (entry CSS sibling lists etc.). */
export function candidatesFromFile(file: string): string[] {
  const resolved = resolve(file);
  if (!existsSync(resolved)) return [];
  const text = readFileSync(resolved, 'utf8');
  return scanFiles([{ file: resolved, content: text }]);
}
