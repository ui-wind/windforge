/**
 * @windforge/tailwind
 *
 * Tailwind v4 → Style IR frontend. Pipeline:
 *
 *   entry CSS ──compile()──▶ design system + source discovery (@source)
 *   sources ──oxide scan──▶ candidates
 *   build(candidates) ──▶ CSS ──collect──▶ rules + theme vars
 *   lower ──▶ RuntimeArtifact (static values, conditions)
 *
 * Compilation runs BEFORE scanning: the Tailwind compiler owns source
 * discovery (`@source` directives, negation included) and the scanner must
 * respect it — the same ordering the official Tailwind v4 tooling uses.
 */
import { IR_VERSION } from '@windforge/ir';
import { dirname, resolve } from 'node:path';
import {
  buildArtifact,
  renderArtifactModule,
  type BuildResult,
  type RuntimeArtifact,
} from './artifact.js';
import { prepareTailwindCompiler, type CompileOptions } from './compile.js';
import { scanCandidates, type ScanSource } from './scan.js';

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

/** Full pipeline: compile → discover sources → scan → build → lower. */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const entry = resolve(options.entry);
  const base = options.base ?? dirname(entry);
  const compileOptions: CompileOptions = {};
  if (options.onDependency) compileOptions.onDependency = options.onDependency;
  if (options.extraCss) compileOptions.extraCss = options.extraCss;

  // Compile first: the compiler reports its configured sources (`@source`
  // directives, `@source not` included) which candidate scanning must respect.
  const prepared = await prepareTailwindCompiler(entry, compileOptions);
  if (!prepared.compiler) {
    return {
      artifact: emptyArtifact(),
      diagnostics: prepared.diagnostics,
    };
  }

  const candidates = scanCandidates(base, {
    sources: [
      ...prepared.compiler.sources.map((source) => ({
        base: source.base,
        pattern: source.pattern,
        negated: source.negated,
      })),
      // Catch-all at the entry directory: covers layouts whose classes live
      // outside the default app/src/components globs. The oxide scanner keeps
      // this bounded (node_modules/.git ignored, .gitignore respected).
      { base: dirname(entry), pattern: '**/*' },
      ...(options.sources ?? []),
    ],
  });
  const css = prepared.compiler.build(candidates);
  if (css === '') {
    return { artifact: emptyArtifact(), diagnostics: [] };
  }
  const built = buildArtifact(css, IR_VERSION);
  return {
    artifact: built.artifact,
    diagnostics: built.diagnostics,
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
export {
  compileTailwindCss,
  prepareTailwindCompiler,
  type CompileOptions,
  type CompileResult,
  type PreparedCompiler,
} from './compile.js';
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
