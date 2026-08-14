/**
 * Metro resolver hook: maps the virtual module `windforge/generated` to the
 * compiled artifact file on disk. On the web platform (when a `.web.js`
 * variant exists), serves the web-specific module instead so Metro's
 * platform-split delivers CSS-first artifacts to React Native Web.
 * Everything else falls through to Metro's default resolution.
 */
import { GENERATED_MODULE_NAME } from './compiler.js';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type ResolutionLike = {
  type: string;
  filePath: string;
};

export type ResolverContextLike = {
  resolveRequest: (
    context: ResolverContextLike,
    moduleName: string,
    platform: string | null | undefined,
  ) => ResolutionLike;
  [key: string]: unknown;
};

/**
 * Build a Metro `resolveRequest` that intercepts `windforge/generated`.
 *
 * @param outputFile absolute path of the native artifact written by compileWindforge
 * @param existing optional resolveRequest to delegate to (chaining)
 */
export function windforgeResolveRequest(
  outputFile: string,
  existing?: (
    context: ResolverContextLike,
    moduleName: string,
    platform: string | null | undefined,
  ) => ResolutionLike,
): (
  context: ResolverContextLike,
  moduleName: string,
  platform: string | null | undefined,
) => ResolutionLike {
  // Pre-compute the web variant path. Metro's platform resolution will
  // prefer `.web.js` over `.js` when platform === 'web', but we also
  // explicitly check here as a safety net for resolvers that don't use
  // suffix-based platform splitting.
  const webOutputFile = join(dirname(outputFile), 'generated.web.js');

  return (context, moduleName, platform) => {
    if (moduleName === GENERATED_MODULE_NAME) {
      // Serve the web module when platform is web and the file exists.
      // The existence check avoids serving a stale web file when the
      // compiler ran in native-only mode.
      if (platform === 'web') {
        try {
          if (existsSync(webOutputFile)) {
            return { type: 'sourceFile', filePath: webOutputFile };
          }
        } catch {
          // Fall through to native artifact.
        }
      }
      return { type: 'sourceFile', filePath: outputFile };
    }
    if (existing) return existing(context, moduleName, platform);
    return context.resolveRequest(context, moduleName, platform);
  };
}
