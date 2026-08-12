/**
 * Artifact registry.
 *
 * The generated module (`windforge/generated`) calls `registerArtifact` at
 * import time; components read from the registry during render. Multiple
 * artifacts may be registered (feature-split builds); later registrations
 * win per class name, matching CSS cascade intuition for split bundles.
 */
import { isCompatibleArtifact, type RuntimeArtifact } from './types.js';

const artifacts: RuntimeArtifact[] = [];

let version = 0;

export function registerArtifact(artifact: RuntimeArtifact): void {
  if (!isCompatibleArtifact(artifact)) {
    throw new Error(
      `@windforge/react-native: incompatible artifact (version=${String(
        (artifact as { version?: unknown })?.version,
      )}, irVersion=${String((artifact as { irVersion?: unknown })?.irVersion)}). ` +
        'Rebuild with a matching @windforge/tailwind.',
    );
  }
  artifacts.push(artifact);
  version += 1;
}

/** Read-only view over registered artifacts, most recent first. */
export function getArtifacts(): readonly RuntimeArtifact[] {
  return artifacts;
}

/** Bumped on every registration; used as a cache-generation key. */
export function registryVersion(): number {
  return version;
}

/** Test-only: reset the registry. Not part of the public contract. */
export function __resetRegistry(): void {
  artifacts.length = 0;
  version = 0;
}
