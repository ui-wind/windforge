/**
 * Windforge Metro configuration types.
 *
 * Metro's own types are modeled structurally so this package does not take a
 * hard dependency on `metro` at build time — apps bring their own Metro via
 * Expo. Phase 1 will tighten these as the real transformer and watcher land.
 */
export type WindforgeMetroConfig = {
  /** Entry CSS file(s) to compile, e.g. `global.css`. Phase 1 input. */
  input?: string | string[];
  /** Where compiled artifacts are written. Defaults to `.windforge`. */
  outputDir?: string;
  /** Watch mode is inferred from Metro; this flag forces it off for tests. */
  watch?: boolean;
  /** Emit diagnostics during compilation. */
  diagnostics?: boolean;
};

/** Structural subset of Metro's IncomingConfig we depend on. */
export type MetroConfigLike = {
  transformer?: {
    getTransformOptions?: unknown;
    [key: string]: unknown;
  };
  resolver?: {
    sourceExts?: string[];
    resolveRequest?: unknown;
    [key: string]: unknown;
  };
  watchFolders?: string[];
  [key: string]: unknown;
};
