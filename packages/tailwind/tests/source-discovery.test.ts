/**
 * Tailwind-native source discovery — generate() compiles the entry first and
 * honors the compiler's sources (`@source` / `@source not`), plus a catch-all
 * at the entry directory. The oxide scanner additionally respects .gitignore.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generate } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('generate() source discovery', () => {
  it('picks up @source directories outside the default globs', async () => {
    const fixture = resolve(HERE, 'fixtures/sources');
    const { artifact, diagnostics } = await generate({
      entry: resolve(fixture, 'src/global.css'),
      base: fixture,
    });
    expect(diagnostics).toEqual([]);
    // Catch-all at the entry dir finds the app's own classes.
    expect(artifact.styles['p-4']).toBeDefined();
    // @source "../shared" reaches classes outside src/.
    expect(artifact.styles['bg-rose-500']).toBeDefined();
  });

  it('excludes .gitignored files from the candidate scan', async () => {
    const fixture = resolve(HERE, 'fixtures/sources');
    const { artifact } = await generate({
      entry: resolve(fixture, 'src/global.css'),
      base: fixture,
    });
    // shared/ignored/ is listed in fixtures/sources/.gitignore.
    expect(artifact.styles['bg-lime-500']).toBeUndefined();
  });

  it('honors @source not (negated compiler sources)', async () => {
    const fixture = resolve(HERE, 'fixtures/sources-not');
    const { artifact, diagnostics } = await generate({
      entry: resolve(fixture, 'src/global.css'),
      base: fixture,
    });
    expect(diagnostics).toEqual([]);
    expect(artifact.styles['bg-amber-500']).toBeDefined();
    expect(artifact.styles['bg-cyan-500']).toBeUndefined();
  });
});
