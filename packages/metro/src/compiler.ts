/**
 * Build-time compilation step for Metro.
 *
 * Runs the @windforge/tailwind pipeline (scan → compile → lower), optionally
 * injecting extension CSS (@windforge/extension-sdk) and running custom
 * frontends, and writes the runtime artifact module that app code imports as
 * `windforge/generated`. Called from an async `metro.config.js` before Metro
 * starts:
 *
 * ```js
 * module.exports = async () => {
 *   await compileWindforge({
 *     entry: './src/global.css',
 *     extensions: require('./windforge.config.cjs').extensions,
 *   });
 *   return withWindforge(getDefaultConfig(__dirname), {
 *     input: './src/global.css',
 *   });
 * };
 * ```
 */
import type { ExtensionDescriptor } from '@windforge/extension-sdk';
import { renderExtensions } from '@windforge/extension-sdk';
import {
  generate,
  renderArtifactsModule,
  type Diagnostic,
  type GenerateOptions,
  type RuntimeArtifact,
} from '@windforge/tailwind';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { validateFrontendArtifact, type WindforgeFrontend } from './frontend.js';

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
  /**
   * Windforge extensions (defineUtility/defineVariant/defineTokens/
   * definePreset descriptors). Rendered to CSS and injected into the entry
   * stylesheet before Tailwind compilation.
   */
  extensions?: ExtensionDescriptor[];
  /** Custom frontends; their artifacts register after the Tailwind one. */
  frontends?: WindforgeFrontend[];
};

export type CompileWindforgeResult = {
  /** Absolute path of the written artifact module. */
  outputFile: string;
  /** Deterministic hash of the default (Tailwind) artifact. */
  hash: string;
  /** Hashes of every registered artifact, in registration order. */
  hashes: string[];
  diagnostics: Diagnostic[];
};

export async function compileWindforge(
  options: CompileWindforgeOptions,
): Promise<CompileWindforgeResult> {
  const entry = resolve(options.entry);
  const outputDir = resolve(options.outputDir ?? '.windforge');
  const base = options.base ? resolve(options.base) : dirname(entry);

  const diagnostics: Diagnostic[] = [];

  // Extensions lower to CSS text; WF3xxx validation happens pre-render
  // (oxide positions cannot be attributed back to the extension).
  const generateOptions: GenerateOptions = { entry, base };
  if (options.extensions && options.extensions.length > 0) {
    const rendered = renderExtensions(options.extensions);
    diagnostics.push(...rendered.diagnostics);
    if (rendered.css !== '') generateOptions.extraCss = rendered.css;
  }

  const { artifact, diagnostics: tailwindDiagnostics } = await generate(generateOptions);
  diagnostics.push(...tailwindDiagnostics);

  const artifacts: RuntimeArtifact[] = [artifact];
  for (const frontend of options.frontends ?? []) {
    for (const candidate of frontend.generate({ entry, base })) {
      const problem = validateFrontendArtifact(frontend.name, candidate);
      if (problem) {
        diagnostics.push(problem);
        continue;
      }
      artifacts.push(candidate);
    }
  }

  await mkdir(outputDir, { recursive: true });
  const outputFile = join(outputDir, GENERATED_FILE_NAME);
  await writeFile(outputFile, renderArtifactsModule(artifacts), 'utf8');

  if (options.diagnostics !== false) {
    for (const diagnostic of diagnostics) {
      // eslint-disable-next-line no-console
      console.warn(`[windforge] ${diagnostic.code}: ${diagnostic.message}`);
    }
  }

  return { outputFile, hash: artifact.hash, hashes: artifacts.map((a) => a.hash), diagnostics };
}
