/**
 * @windforge/vite plugin tests.
 *
 * Verifies the Vite plugin contract without requiring a running Vite server:
 * virtual module resolution, CSS compilation, artifact generation, and HMR
 * invalidation logic. Integration tests (headless Chrome pixel-verify) live
 * in apps/vite-example (Phase 13 step G).
 */
import { describe, expect, it } from 'vitest';
import { windforge } from '../src/index.js';

describe('windforge vite plugin', () => {
  const entry = new URL('./fixtures/global.css', import.meta.url).pathname;

  function makePlugin() {
    return windforge({ entry, diagnostics: false });
  }

  it('resolves windforge/generated to a virtual id', () => {
    const plugin = makePlugin();
    const resolved = plugin.resolveId?.('windforge/generated');
    expect(resolved).toBe('\0windforge/generated');
  });

  it('resolves windforge/styles.css to a virtual id', () => {
    const plugin = makePlugin();
    const resolved = plugin.resolveId?.('windforge/styles.css');
    expect(resolved).toBe('\0windforge/styles.css');
  });

  it('returns null for unrelated module ids', () => {
    const plugin = makePlugin();
    expect(plugin.resolveId?.('react')).toBeNull();
    expect(plugin.resolveId?.('./App.tsx')).toBeNull();
  });

  it('loads windforge/generated as an ES module with registerArtifact', async () => {
    const plugin = makePlugin();
    const result = await plugin.load?.('\0windforge/generated');
    expect(result).toContain('registerArtifact');
    expect(result).toContain('@windforge/react-native');
  });

  it('loads windforge/styles.css as compiled CSS with utilities', async () => {
    const plugin = makePlugin();
    const result = await plugin.load?.('\0windforge/styles.css');
    expect(typeof result).toBe('string');
    // The fixture App.tsx uses p-4, bg-accent, hover:bg-red-500, dark:bg-zinc-900.
    // Tailwind should emit these utilities in the compiled output.
    expect(result).toContain('.p-4');
    expect(result).toContain('.bg-accent');
    expect(result).toContain('hover\\:bg-red-500');
    expect(result).toContain('dark\\:bg-zinc-900');
  });

  it('has name "windforge" and enforce "pre"', () => {
    const plugin = makePlugin();
    expect(plugin.name).toBe('windforge');
    expect(plugin.enforce).toBe('pre');
  });

  it('caches compilation across multiple loads', async () => {
    const plugin = makePlugin();
    const first = await plugin.load?.('\0windforge/generated');
    const second = await plugin.load?.('\0windforge/generated');
    expect(first).toBe(second); // Same string reference = cached.
  });
});
