/**
 * @windforge/tailwind
 *
 * Tailwind v4 → Style IR frontend. Pipeline:
 *
 *   entry CSS ──compile()──▶ design system
 *   source files ──oxide scan──▶ candidates
 *   build(candidates) ──▶ CSS ──collect──▶ rules + theme vars
 *   lower ──▶ RuntimeArtifact (static values, conditions)
 */
import { IR_VERSION } from '@windforge/ir';
import { dirname } from 'node:path';
import {
  buildArtifact,
  renderArtifactModule,
  type BuildResult,
  type RuntimeArtifact,
} from './artifact.js';
import { compileTailwindCss, type CompileOptions } from './compile.js';
import { scanCandidates, type ScanSource } from './scan.js';
import type { Diagnostic } from './types.js';

export type GenerateOptions = {
  /** Entry stylesheet, e.g. `./src/global.css`. */
  entry: string;
  /** Source root to scan for class candidates; defaults to the entry dir. */
  base?: string;
  /** Extra candidate sources. */
  sources?: ScanSource[];
  /** Watch hook: called for each CSS dependency (@import/@plugin target). */
  onDependency?: (path: string) => void;
  /**
   * CSS text appended to the entry source before compilation — the
   * @windforge/metro extension seam renders `defineUtility`/`defineVariant`/
   * `defineTokens` output into this field.
   */
  extraCss?: string;
};

export type GenerateResult = BuildResult;

/** Full pipeline: scan → compile → collect → lower → artifact. */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const base = options.base ?? dirname(options.entry);
  const candidates = scanCandidates(base, options.sources ? { sources: options.sources } : {});
  const compileOptions: CompileOptions = {};
  if (options.onDependency) compileOptions.onDependency = options.onDependency;
  if (options.extraCss) compileOptions.extraCss = options.extraCss;
  const compiled = await compileTailwindCss(options.entry, candidates, compileOptions);
  if (compiled.css === '') {
    return {
      artifact: emptyArtifact(),
      diagnostics: compiled.diagnostics,
    };
  }
  const built = buildArtifact(compiled.css, IR_VERSION);
  return {
    artifact: built.artifact,
    diagnostics: [...compiled.diagnostics, ...built.diagnostics],
  };
}

function emptyArtifact(): RuntimeArtifact {
  return {
    version: 1,
    irVersion: IR_VERSION,
    hash: '00000000',
    styles: {},
    conditions: [],
    dependencies: {},
  };
}

export {
  ARTIFACT_VERSION,
  buildArtifact,
  renderArtifactModule,
  renderArtifactsModule,
  type BuildResult,
  type ClassEntry,
  type RuntimeArtifact,
  type VariantEntry,
} from './artifact.js';
export { compileTailwindCss } from './compile.js';
export { colorToHex } from './css/color.js';
export { collectStylesheet } from './css/collect.js';
export { lowerDeclaration } from './css/lower.js';
export { parseMediaQuery } from './css/media.js';
export { resolveNumeric, substituteVars } from './css/resolve.js';
export {
  candidatesFromFile,
  defaultSources,
  scanCandidates,
  scanFiles,
  type ScanOptions,
  type ScanSource,
} from './scan.js';
export {
  conditionId,
  specToConditionIR,
  type ConditionSpec,
  type Diagnostic,
} from './types.js';
