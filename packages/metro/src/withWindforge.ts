/**
 * `withWindforge` — Windforge's Metro integration.
 *
 * Phase 0 skeleton: wraps the existing Metro config without altering
 * transform behavior, and validates Windforge options. The real pipeline
 * (source discovery → Tailwind v4 compile → CSS AST → Style IR → runtime
 * artifacts) plugs in here in Phase 1; this wrapper owns the seam so app
 * `metro.config.js` files do not change between phases.
 */
import type { MetroConfigLike, WindforgeMetroConfig } from './config.js';

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
 * Wrap a Metro config with Windforge.
 *
 * ```js
 * // metro.config.js
 * const { getDefaultConfig } = require('expo/metro-config');
 * const { withWindforge } = require('@windforge/metro');
 * module.exports = withWindforge(getDefaultConfig(__dirname), {
 *   input: './global.css',
 * });
 * ```
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

  const config: WindforgeEnabledConfig = {
    ...metroConfig,
    windforge: {
      ...windforge,
      outputDir: windforge.outputDir ?? DEFAULTS.outputDir,
      diagnostics: windforge.diagnostics ?? DEFAULTS.diagnostics,
    },
  };

  return config;
}
