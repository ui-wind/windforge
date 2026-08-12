import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  hashIR,
  IR_VERSION,
  toCanonicalString,
  type StyleIR,
} from '../src/index.js';

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url));

const fixtureNames = readdirSync(FIXTURES_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();

describe('IR fixtures', () => {
  it('has fixtures committed', () => {
    expect(fixtureNames.length).toBeGreaterThan(0);
  });

  it.each(fixtureNames)('%s carries the current IR version', (name) => {
    const doc = JSON.parse(
      readFileSync(join(FIXTURES_DIR, name), 'utf8'),
    ) as StyleIR;
    expect(doc.version).toBe(IR_VERSION);
    expect(Array.isArray(doc.declarations)).toBe(true);
  });

  it.each(fixtureNames)('%s serializes deterministically across reloads', (name) => {
    const path = join(FIXTURES_DIR, name);
    const first = JSON.parse(readFileSync(path, 'utf8')) as StyleIR;
    const second = JSON.parse(readFileSync(path, 'utf8')) as StyleIR;
    expect(toCanonicalString(first)).toBe(toCanonicalString(second));
  });

  it.each(fixtureNames)('%s canonical output + hash snapshot', (name) => {
    const doc = JSON.parse(
      readFileSync(join(FIXTURES_DIR, name), 'utf8'),
    ) as StyleIR;
    // Metadata must not leak into canonical output used for hashing.
    const canonical = toCanonicalString(doc);
    expect(canonical).toMatchSnapshot();
    expect(hashIR(doc)).toMatchSnapshot();
  });

  it('fixtures with different content produce different hashes', () => {
    const hashes = fixtureNames.map((name) =>
      hashIR(JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8')) as StyleIR),
    );
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});
