/**
 * Build-time compilation step for Metro.
 *
 * Runs the @windforge/tailwind pipeline (scan → compile → lower) and writes
 * the runtime artifact module that app code imports as `windforge/generated`.
 * Called from an async `metro.config.js` before Metro starts:
 *
 * ```js
 * module.exports = async () => {
 *   await compileWindforge({ entry: './src/global.css' });
 *   return withWindforge(getDefaultConfig(__dirname), {
 *     input: './src/global.css',
 *   });
 * };
 * ```
 */
import { generate, renderArtifactModule, type Diagnostic } from '@windforge/tailwind';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export const GENERATED_MODULE_NAME = 'windforge/generated';
export const GENERATED_FILE_NAME = 'generated.js';

export type CompileWindforgeOptions = {
  /** Entry stylesheet, e.g. `./src/global.css`. */
  entry: string;
  /** Source root to scan for class candidates; defaults to the entry dir. */
  base?: string;
  /** Artifact output directory. Defaults to `.windforge` (project cwd). */
  outputDir?: string;
  /** Log diagnostics to stderr. Defaults to true. */
  diagnostics?: boolean;
};

export type CompileWindforgeResult = {
  /** Absolute path of the written artifact module. */
  outputFile: string;
  /** Deterministic artifact hash (content-addressed change detection). */
  hash: string;
  diagnostics: Diagnostic[];
};

export async function compileWindforge(
  options: CompileWindforgeOptions,
): Promise<CompileWindforgeResult> {
  const entry = resolve(options.entry);
  const outputDir = resolve(options.outputDir ?? '.windforge');
  const base = options.base ? resolve(options.base) : dirname(entry);

  const { artifact, diagnostics } = await generate({ entry, base });

  await mkdir(outputDir, { recursive: true });
  const outputFile = join(outputDir, GENERATED_FILE_NAME);
  await writeFile(outputFile, renderArtifactModule(artifact), 'utf8');

  if (options.diagnostics !== false) {
    for (const diagnostic of diagnostics) {
      // eslint-disable-next-line no-console
      console.warn(`[windforge] ${diagnostic.code}: ${diagnostic.message}`);
    }
  }

  return { outputFile, hash: artifact.hash, diagnostics };
}
