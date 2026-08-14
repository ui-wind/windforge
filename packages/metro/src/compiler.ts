/**
 * Build-time compilation step for Metro.
 *
 * Runs the @windforge/tailwind pipeline (compile → discover sources → scan →
 * lower), optionally injecting extension CSS (@windforge/extension-sdk) and
 * running custom frontends, and writes the runtime artifact module that app
 * code imports as `windforge/generated`. Called from an async
 * `metro.config.js` before Metro starts:
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
 *
 * Watch mode (on by default, off when `watch: false` or `process.env.CI`)
 * regenerates the artifact when source files or CSS `@import` dependencies
 * change. The artifact lives inside the watched project root, so Metro
 * invalidates and rebundles on its own — no Metro internals are patched.
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
import { watch as fsWatch, type FSWatcher } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { validateFrontendArtifact, type WindforgeFrontend } from './frontend.js';

export const GENERATED_MODULE_NAME = 'windforge/generated';
export const GENERATED_FILE_NAME = 'generated.js';

/** Coalesce bursty fs events into one rebuild. */
const WATCH_DEBOUNCE_MS = 100;

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
  /**
   * Regenerate the artifact when sources or CSS dependencies change.
   * Defaults to true unless `process.env.CI` is set.
   */
  watch?: boolean;
  /** Called after each watch-mode rebuild (not for the initial compile). */
  onRebuild?: (result: CompileWindforgeResult) => void;
  /**
   * Registered theme names (Phase 12). Injected as `@custom-variant`
   * declarations so `theme:` variants lower to theme conditions; per-theme
   * variable rules (`.name { --var: ...; }`) are harvested into the
   * artifact's `themes` field. See @windforge/tailwind GenerateOptions.
   */
  extraThemes?: string[];
};

export type CompileWindforgeResult = {
  /** Absolute path of the written artifact module. */
  outputFile: string;
  /** Deterministic hash of the default (Tailwind) artifact. */
  hash: string;
  /** Hashes of every registered artifact, in registration order. */
  hashes: string[];
  diagnostics: Diagnostic[];
  /** Stops the file watcher. Present only when watch mode is enabled. */
  stop?: () => void;
};

type Compilation = {
  moduleText: string;
  hash: string;
  hashes: string[];
  diagnostics: Diagnostic[];
  /** CSS dependencies (@import/@plugin targets) collected by this pass. */
  cssDependencies: string[];
};

async function runCompilation(
  options: CompileWindforgeOptions,
  entry: string,
  base: string,
): Promise<Compilation> {
  const diagnostics: Diagnostic[] = [];

  // Extensions lower to CSS text; WF3xxx validation happens pre-render
  // (oxide positions cannot be attributed back to the extension).
  const generateOptions: GenerateOptions = { entry, base };
  if (options.extraThemes && options.extraThemes.length > 0) {
    generateOptions.extraThemes = options.extraThemes;
  }
  if (options.extensions && options.extensions.length > 0) {
    const rendered = renderExtensions(options.extensions);
    diagnostics.push(...rendered.diagnostics);
    if (rendered.css !== '') generateOptions.extraCss = rendered.css;
  }
  const cssDependencies: string[] = [];
  generateOptions.onDependency = (dependency) => {
    cssDependencies.push(dependency);
  };

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

  return {
    moduleText: renderArtifactsModule(artifacts),
    hash: artifact.hash,
    hashes: artifacts.map((a) => a.hash),
    diagnostics,
    cssDependencies,
  };
}

function logDiagnostics(options: CompileWindforgeOptions, diagnostics: Diagnostic[]): void {
  if (options.diagnostics === false) return;
  for (const diagnostic of diagnostics) {
    // eslint-disable-next-line no-console
    console.warn(`[windforge] ${diagnostic.code}: ${diagnostic.message}`);
  }
}

export async function compileWindforge(
  options: CompileWindforgeOptions,
): Promise<CompileWindforgeResult> {
  const entry = resolve(options.entry);
  const outputDir = resolve(options.outputDir ?? '.windforge');
  const base = options.base ? resolve(options.base) : dirname(entry);
  const outputFile = join(outputDir, GENERATED_FILE_NAME);

  const first = await runCompilation(options, entry, base);
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputFile, first.moduleText, 'utf8');
  logDiagnostics(options, first.diagnostics);

  const result: CompileWindforgeResult = {
    outputFile,
    hash: first.hash,
    hashes: first.hashes,
    diagnostics: first.diagnostics,
  };

  const watchEnabled = options.watch ?? !process.env.CI;
  if (watchEnabled) {
    result.stop = startWatch(options, entry, base, outputDir, outputFile, first);
  }
  return result;
}

function startWatch(
  options: CompileWindforgeOptions,
  entry: string,
  base: string,
  outputDir: string,
  outputFile: string,
  initial: Compilation,
): () => void {
  let lastModuleText = initial.moduleText;
  let rebuildTimer: NodeJS.Timeout | null = null;
  let rebuilding = false;
  let pending = false;
  let stopped = false;

  const rootWatchers: FSWatcher[] = [];
  const dependencyWatchers = new Map<string, FSWatcher>();
  const processListeners: Array<[NodeJS.Signals | 'exit', () => void]> = [];

  const scheduleRebuild = (): void => {
    if (stopped || rebuildTimer) return;
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      void rebuild();
    }, WATCH_DEBOUNCE_MS);
  };

  async function rebuild(): Promise<void> {
    if (stopped) return;
    if (rebuilding) {
      pending = true;
      return;
    }
    rebuilding = true;
    try {
      const compiled = await runCompilation(options, entry, base);
      if (stopped) return;
      syncDependencyWatchers(compiled.cssDependencies);
      // Skip the write when nothing changed: keeps Metro's cache warm and
      // avoids re-triggering the watcher on its own output.
      if (compiled.moduleText !== lastModuleText) {
        lastModuleText = compiled.moduleText;
        await writeFile(outputFile, compiled.moduleText, 'utf8');
      }
      logDiagnostics(options, compiled.diagnostics);
      options.onRebuild?.({
        outputFile,
        hash: compiled.hash,
        hashes: compiled.hashes,
        diagnostics: compiled.diagnostics,
      });
    } catch (error) {
      // A transiently broken source (mid-save, deleted entry) must not kill
      // the watcher — surface and wait for the next change.
      const message = error instanceof Error ? error.message : String(error);
      logDiagnostics(options, [
        { code: 'WF1007', message: `Watch rebuild failed: ${message}` },
      ]);
    } finally {
      rebuilding = false;
      if (pending && !stopped) {
        pending = false;
        scheduleRebuild();
      }
    }
  }

  const isIgnoredEvent = (filename: string): boolean => {
    const segments = filename.split(/[\\/]/);
    if (segments.some((s) => s === 'node_modules' || s === '.git')) return true;
    const absolute = resolve(base, filename);
    return absolute === outputFile || absolute.startsWith(outputDir + sep);
  };

  const rootWatcher = fsWatch(base, { recursive: true }, (_event, filename) => {
    if (filename && !isIgnoredEvent(filename.toString())) scheduleRebuild();
  });
  rootWatcher.on('error', () => {
    // Watching is best-effort; never crash Metro over a watch error.
  });
  rootWatchers.push(rootWatcher);

  function watchDependency(dependency: string): void {
    if (dependencyWatchers.has(dependency)) return;
    try {
      const watcher = fsWatch(dependency, () => scheduleRebuild());
      watcher.on('error', () => {});
      dependencyWatchers.set(dependency, watcher);
    } catch {
      // A dep that cannot be watched (already deleted) surfaces through the
      // next rebuild's diagnostics instead.
    }
  }

  function syncDependencyWatchers(dependencies: string[]): void {
    const next = new Set(dependencies);
    for (const [dependency, watcher] of dependencyWatchers) {
      if (!next.has(dependency)) {
        watcher.close();
        dependencyWatchers.delete(dependency);
      }
    }
    for (const dependency of next) watchDependency(dependency);
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
      rebuildTimer = null;
    }
    for (const watcher of rootWatchers) watcher.close();
    rootWatchers.length = 0;
    for (const watcher of dependencyWatchers.values()) watcher.close();
    dependencyWatchers.clear();
    for (const [signal, listener] of processListeners) {
      process.removeListener(signal, listener);
    }
    processListeners.length = 0;
  }

  const onProcessExit = (): void => stop();
  for (const signal of ['SIGINT', 'SIGTERM', 'exit'] as const) {
    process.once(signal, onProcessExit);
    processListeners.push([signal, onProcessExit]);
  }

  syncDependencyWatchers(initial.cssDependencies);
  return stop;
}
