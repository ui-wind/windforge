/**
 * Metro resolver hook: maps the virtual module `windforge/generated` to the
 * compiled artifact file on disk. Everything else falls through to Metro's
 * default resolution.
 */
import { GENERATED_MODULE_NAME } from './compiler.js';

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
 * @param outputFile absolute path of the artifact written by compileWindforge
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
  return (context, moduleName, platform) => {
    if (moduleName === GENERATED_MODULE_NAME) {
      return { type: 'sourceFile', filePath: outputFile };
    }
    if (existing) return existing(context, moduleName, platform);
    return context.resolveRequest(context, moduleName, platform);
  };
}
