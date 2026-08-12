import { describe, expect, it, beforeEach } from 'vitest';
import { __resetRegistry, getArtifacts, registerArtifact, registryVersion } from '../src/registry.js';
import type { RuntimeArtifact } from '../src/types.js';

function makeArtifact(overrides: Partial<RuntimeArtifact> = {}): RuntimeArtifact {
  return {
    version: 1,
    irVersion: 1,
    hash: 'abc123',
    styles: {},
    conditions: [],
    ...overrides,
  };
}

describe('registry', () => {
  beforeEach(() => __resetRegistry());

  it('registers compatible artifacts and bumps the version', () => {
    expect(registryVersion()).toBe(0);
    registerArtifact(makeArtifact());
    expect(registryVersion()).toBe(1);
    expect(getArtifacts()).toHaveLength(1);
  });

  it('accepts multiple artifacts (split builds)', () => {
    registerArtifact(makeArtifact());
    registerArtifact(makeArtifact({ hash: 'def456' }));
    expect(getArtifacts()).toHaveLength(2);
  });

  it('rejects artifacts with a mismatched format version', () => {
    expect(() => registerArtifact(makeArtifact({ version: 99 }))).toThrow(/incompatible/);
    expect(() => registerArtifact(makeArtifact({ irVersion: 99 }))).toThrow(/incompatible/);
  });

  it('rejects non-object input', () => {
    expect(() => registerArtifact(null as unknown as RuntimeArtifact)).toThrow();
  });
});
