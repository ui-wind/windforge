/**
 * @windforge/vite — Vite plugin for React Native Web + Windforge.
 *
 * Transforms CSS entry files (the same global.css used on native) into:
 *   1. A real CSS file served by Vite's dev server or emitted at build time.
 *   2. A virtual JS module (`windforge/generated`) that registers an empty
 *      artifact so the runtime registry stays satisfied on web.
 *
 * On web, styled components receive `{ className }` from the web-css backend
 * instead of resolved inline styles; the browser evaluates hover/focus/active
 * via CSS pseudo-selectors in the stylesheet. Theme scoping uses `.themeName`
 * root classes that match the selectors Tailwind emits.
 *
 * Usage (vite.config.ts):
 * ```ts
 * import windforge from '@windforge/vite';
 * export default {
 *   plugins: [
 *     windforge({ entry: './src/global.css', extraThemes: ['sunset', 'ocean'] }),
 *   ],
 * };
 * ```
 */
import type { ExtensionDescriptor } from '@windforge/extension-sdk';
import { renderExtensions } from '@windforge/extension-sdk';
import {
  generate,
  renderArtifactModule,
  type Diagnostic,
  type GenerateOptions,
} from '@windforge/tailwind';
import { dirname, resolve } from 'node:path';

export type WindforgeViteOptions = {
  /** Entry stylesheet, e.g. `./src/global.css`. */
  entry: string;
  /** Source root to scan for class candidates; defaults to the entry dir. */
  base?: string;
  /** Registered theme names (Phase 12). See @windforge/tailwind docs. */
  extraThemes?: string[];
  /**
   * Windforge extensions (defineUtility/defineVariant/defineTokens/
   * definePreset descriptors). Rendered to CSS and injected before compile.
   */
  extensions?: ExtensionDescriptor[];
  /** Log diagnostics to stderr. Defaults to true. */
  diagnostics?: boolean;
};

const GENERATED_ID = '\0windforge/generated';
const CSS_VIRTUAL_ID = '\0windforge/styles.css';

/** Minimal Vite Plugin type — avoids hard-depending on vite at type level. */
type VitePlugin = {
  name: string;
  enforce?: 'pre' | 'post';
  /** Phase 16: return a partial Vite config to merge (e.g. optimizeDeps). */
  config?: () => Record<string, unknown> | undefined;
  resolveId?: (id: string, importer?: string) => string | null | undefined;
  load?: (id: string) => string | null | undefined | Promise<string | null | undefined>;
  transform?: (code: string, id: string) => { code: string; map?: null } | null | undefined | Promise<{ code: string; map?: null } | null | undefined>;
  configureServer?: (server: { watcher: { add: (path: string) => void } }) => void;
  handleHotUpdate?: (ctx: { file: string; server: { moduleGraph: { invalidateAll: () => void } } }) => void;
};

function logDiagnostics(enabled: boolean, diagnostics: Diagnostic[]): void {
  if (!enabled) return;
  for (const diagnostic of diagnostics) {
    // eslint-disable-next-line no-console
    console.warn(`[windforge] ${diagnostic.code}: ${diagnostic.message}`);
  }
}

export function windforge(options: WindforgeViteOptions): VitePlugin {
  const entryPath = resolve(options.entry);
  const base = options.base ? resolve(options.base) : dirname(entryPath);
  const diagEnabled = options.diagnostics !== false;

  let cachedCss = '';
  let cachedArtifactModule = '';
  let compiled = false;
  const watchedFiles = new Set<string>();

  async function ensureCompiled(): Promise<void> {
    if (compiled) return;
    await recompile();
  }

  async function recompile(): Promise<void> {
    const generateOptions: GenerateOptions = {
      entry: entryPath,
      base,
      platform: 'web',
    };
    if (options.extraThemes && options.extraThemes.length > 0) {
      generateOptions.extraThemes = options.extraThemes;
    }
    const cssDependencies: string[] = [];
    generateOptions.onDependency = (dep) => {
      cssDependencies.push(dep);
      watchedFiles.add(dep);
    };
    if (options.extensions && options.extensions.length > 0) {
      const rendered = renderExtensions(options.extensions);
      logDiagnostics(diagEnabled, rendered.diagnostics);
      if (rendered.css !== '') generateOptions.extraCss = rendered.css;
    }

    const result = await generate(generateOptions);
    logDiagnostics(diagEnabled, result.diagnostics);

    cachedCss = result.css ?? '';
    cachedArtifactModule = renderArtifactModule(result.artifact);
    compiled = true;

    // Track dependencies for HMR invalidation.
    for (const dep of cssDependencies) watchedFiles.add(dep);
  }

  return {
    name: 'windforge',
    enforce: 'pre',

    // Phase 16: react-native-web ships ESM (`module` field) but lacks
    // "type": "module", so Vite 8's Rolldown prebundler may not detect it.
    // Explicit inclusion forces prebundling across Vite 5–8.
    config() {
      return {
        optimizeDeps: {
          include: ['react-native-web'],
        },
      };
    },

    resolveId(id) {
      if (id === 'windforge/generated') return GENERATED_ID;
      if (id === 'windforge/styles.css') return CSS_VIRTUAL_ID;
      return null;
    },

    async load(id) {
      if (id === GENERATED_ID) {
        await ensureCompiled();
        return cachedArtifactModule;
      }
      if (id === CSS_VIRTUAL_ID) {
        await ensureCompiled();
        return cachedCss;
      }
      return null;
    },

    async transform(code, id) {
      // Intercept the user's CSS entry file and replace it with the
      // compiled output so Vite serves the processed CSS (with variants,
      // custom properties, etc.) rather than the raw source.
      if (id === entryPath || id.endsWith('.css')) {
        // Only transform the configured entry file.
        if (resolve(id) !== entryPath) return null;
        await ensureCompiled();
        return { code: cachedCss, map: null };
      }
      return null;
    },

    configureServer(server) {
      // Add CSS dependencies to Vite's watch list so edits trigger HMR.
      for (const file of watchedFiles) {
        server.watcher.add(file);
      }
    },

    handleHotUpdate(ctx) {
      // When any watched file changes, invalidate all modules so the next
      // request triggers a fresh compile. This is coarse but correct —
      // fine-grained HMR for generated CSS is complex and not worth the
      // risk of stale state during development.
      if (watchedFiles.has(ctx.file) || ctx.file === entryPath) {
        compiled = false;
        ctx.server.moduleGraph.invalidateAll();
      }
    },
  };
}

export default windforge;
