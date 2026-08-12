/**
 * `withWindforge` — Windforge's Metro integration.
 *
 * Wraps the existing Metro config and installs the resolver hook that maps
 * the virtual module `windforge/generated` to the compiled artifact file.
 * The compile step itself runs in `compileWindforge` (async metro config) so
 * app `metro.config.js` files stay declarative:
 *
 * ```js
 * module.exports = async () => {
 *   const { getDefaultConfig } = require('expo/metro-config');
 *   const { compileWindforge, withWindforge } = require('@windforge/metro');
 *   await compileWindforge({ entry: './src/global.css' });
 *   return withWindforge(getDefaultConfig(__dirname), {
 *     input: './src/global.css',
 *   });
 * };
 * ```
 */
import { join, resolve } from 'node:path';
import type { MetroConfigLike, WindforgeMetroConfig } from './config.js';
import { GENERATED_FILE_NAME } from './compiler.js';
import {
  windforgeResolveRequest,
  type ResolutionLike,
  type ResolverContextLike,
} from './resolver.js';

export type WindforgeEnabledConfig = MetroConfigLike & {
  /** Attached so later phases (and diagnostics) can find the config. */
  windforge: Required<Pick<WindforgeMetroConfig, 'outputDir' | 'diagnostics'>> &
    Omit<WindforgeMetroConfig, 'outputDir' | 'diagnostics'>;
};

const DEFAULTS = {
  outputDir: '.windforge',
  diagnostics: true,
} as const;

/**
 * Wrap a Metro config with Windforge. Installs the `windforge/generated`
 * resolver; expects `compileWindforge` to have run (or to run before Metro
 * serves) so the artifact file exists.
 */
export function withWindforge(
  metroConfig: MetroConfigLike,
  windforge: WindforgeMetroConfig = {},
): WindforgeEnabledConfig {
  if (metroConfig === null || typeof metroConfig !== 'object') {
    throw new Error(
      '@windforge/metro: withWindforge expects a Metro config object. ' +
        'Pass the result of getDefaultConfig(__dirname) or an existing config.',
    );
  }

  const outputDir = windforge.outputDir ?? DEFAULTS.outputDir;
  const outputFile = join(resolve(outputDir), GENERATED_FILE_NAME);

  const existingResolveRequest = metroConfig.resolver?.resolveRequest as
    | ((
        context: ResolverContextLike,
        moduleName: string,
        platform: string | null | undefined,
      ) => ResolutionLike)
    | undefined;

  const config: WindforgeEnabledConfig = {
    ...metroConfig,
    resolver: {
      ...metroConfig.resolver,
      resolveRequest: windforgeResolveRequest(outputFile, existingResolveRequest),
    },
    windforge: {
      ...windforge,
      outputDir,
      diagnostics: windforge.diagnostics ?? DEFAULTS.diagnostics,
    },
  };

  return config;
}
