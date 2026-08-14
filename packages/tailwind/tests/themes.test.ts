/**
 * Phase 12 — named themes compiler tests.
 *
 * Verifies that `extraThemes` injects `@custom-variant` declarations, that
 * theme-variant utilities lower to `theme:` conditions in the artifact, and
 * that per-theme variable selectors (`.sunset { --color-accent: ... }`) are
 * harvested into `artifact.themes`.
 */
import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { generate } from '../src/index.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/themes');
const ENTRY = resolve(FIXTURE, 'src/global.css');

describe('named themes — extraThemes injection', () => {
  it('compiles theme-variant utilities when extraThemes is provided', async () => {
    const result = await generate({
      entry: ENTRY,
      base: FIXTURE,
      extraThemes: ['sunset', 'ocean'],
    });
    // No compilation errors.
    expect(result.diagnostics).toEqual([]);
    // Theme-variant utilities must be present in the artifact styles.
    expect(result.artifact.styles['sunset:bg-red-500']).toBeDefined();
    expect(result.artifact.styles['ocean:bg-blue-500']).toBeDefined();
  });

  it('filters out light/dark from extraThemes (built-in)', async () => {
    const result = await generate({
      entry: ENTRY,
      base: FIXTURE,
      extraThemes: ['light', 'dark', 'sunset'],
    });
    expect(result.diagnostics).toEqual([]);
    // sunset: variant compiles (injected via extraThemes)
    expect(result.artifact.styles['sunset:bg-red-500']).toBeDefined();
    // dark: variant compiles without injection (Tailwind built-in)
    expect(result.artifact.styles['dark:bg-black']).toBeDefined();
  });
});

describe('named themes — artifact v2 + themes field', () => {
  it('harvests per-theme variable selectors into artifact.themes', async () => {
    const result = await generate({
      entry: ENTRY,
      base: FIXTURE,
      extraThemes: ['sunset', 'ocean'],
    });
    expect(result.artifact.version).toBe(2);
    expect(result.artifact.themes).toBeDefined();
    expect(result.artifact.themes?.sunset).toBeDefined();
    expect(result.artifact.themes?.ocean).toBeDefined();

    const sunsetAccent = result.artifact.themes?.sunset?.find((e) => e.name === '--color-accent');
    expect(sunsetAccent).toBeDefined();
    expect(Array.isArray(sunsetAccent?.tokens)).toBe(true);

    const oceanAccent = result.artifact.themes?.ocean?.find((e) => e.name === '--color-accent');
    expect(oceanAccent).toBeDefined();
  });

  it('lowers theme-variant utilities to theme: conditions', async () => {
    const result = await generate({
      entry: ENTRY,
      base: FIXTURE,
      extraThemes: ['sunset'],
    });
    // The artifact must carry a condition with kind=theme, name=sunset.
    const themeCondition = result.artifact.conditions.find(
      (c) => c.kind === 'theme' && (c as { name?: string }).name === 'sunset',
    );
    expect(themeCondition).toBeDefined();

    // The class entry for sunset:bg-red-500 must reference that condition.
    const classEntry = result.artifact.styles['sunset:bg-red-500'];
    expect(classEntry).toBeDefined();
    const variantCondIds = classEntry?.variants?.flatMap((v) => v.conditionIds) ?? [];
    expect(variantCondIds).toContain(themeCondition?.id);
  });
});

describe('named themes — backward compatibility', () => {
  it('produces artifact v2 even without extraThemes', async () => {
    const result = await generate({ entry: ENTRY, base: FIXTURE });
    expect(result.artifact.version).toBe(2);
    // Base @theme values are always emitted under "default" so
    // useCSSVariable can resolve them for the default theme.
    if (result.artifact.themes) {
      expect(result.artifact.themes['default']).toBeDefined();
    }
  });
});
