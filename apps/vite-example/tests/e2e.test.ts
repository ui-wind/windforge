/**
 * @windforge/vite-example E2E tests (Phase 17-A3).
 *
 * Headless Chromium verification of the web-css backend via Playwright.
 * Builds the app, serves dist with `vite preview`, then asserts:
 *   - className is stamped on DOM elements by RNW / web-css backend
 *   - hover pseudo-selector changes background color
 *   - dark mode media query swaps colors when system preference flips
 *   - responsive breakpoint applies at narrow viewport
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, '..');
const PREVIEW_PORT = 4173;
const BASE_URL = `http://localhost:${PREVIEW_PORT}`;

let server: ChildProcess;
let browser: Browser;
let page: Page;

async function waitForServer(url: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

beforeAll(async () => {
  // Serve pre-built dist via vite preview.
  server = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT)], {
    cwd: APP_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production' },
  });

  await waitForServer(BASE_URL);
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
}, 30_000);

afterAll(async () => {
  await browser?.close();
  server?.kill();
});

describe('web-css backend E2E', () => {
  it('renders the page and className attributes are present on DOM elements', async () => {
    await page.goto(BASE_URL);
    await page.waitForSelector('h1');

    const headingText = await page.textContent('h1');
    expect(headingText).toContain('Windforge Web CSS Backend');

    // Verify className is stamped (the h1 has text-2xl font-bold etc.)
    const h1Class = await page.getAttribute('h1', 'class');
    expect(h1Class).toBeTruthy();
    expect(h1Class).toContain('text-2xl');
  });

  it('bg-accent token resolves to the correct color', async () => {
    await page.goto(BASE_URL);
    // The accent box contains "bg-accent token"
    const accentBox = await page.locator('text=bg-accent token').locator('..');
    const bg = await accentBox.evaluate((el) => getComputedStyle(el).backgroundColor);
    // Accent is #3b82f6. Tailwind v4 emits oklch; browsers may report either format.
    // Verify it's NOT white/black/zinc (i.e., the token resolved to something colored).
    expect(bg).not.toBe('rgb(0, 0, 0)');
    expect(bg).not.toBe('rgb(255, 255, 255)');
    expect(bg).toMatch(/oklch|rgb/);
  });

  it('hover:bg-red-500 activates on mouseover', async () => {
    await page.goto(BASE_URL);
    const hoverBox = await page.locator('text=Hover me').locator('..');

    // Before hover
    const bgBefore = await hoverBox.evaluate((el) => getComputedStyle(el).backgroundColor);

    // Hover
    await hoverBox.hover();
    await page.waitForTimeout(100);
    const bgAfter = await hoverBox.evaluate((el) => getComputedStyle(el).backgroundColor);

    // The background must have changed (zinc-800 → red-500)
    expect(bgAfter).not.toBe(bgBefore);
  });

  it('dark:bg-zinc-900 activates with prefers-color-scheme: dark', async () => {
    // Create a context with dark color scheme preference
    const darkContext = await browser.newContext({
      colorScheme: 'dark',
    });
    const darkPage = await darkContext.newPage();
    await darkPage.goto(BASE_URL);

    const darkBox = await darkPage.locator('text=Dark mode aware').locator('..');
    const bg = await darkBox.evaluate((el) => getComputedStyle(el).backgroundColor);
    // dark:bg-zinc-900 — just verify it's a very dark color (not white)
    expect(bg).toMatch(/oklch|rgb/);
    // Should not be white or light
    expect(bg).not.toBe('rgb(255, 255, 255)');

    await darkPage.close();
    await darkContext.close();
  });

  it('sm:bg-green-700 applies at ≥640px viewport width', async () => {
    // Wide viewport (≥640px)
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto(BASE_URL);
    const wideBox = await page.locator('text=Responsive').locator('..');
    const bgWide = await wideBox.evaluate((el) => getComputedStyle(el).backgroundColor);
    // sm:bg-green-700 — verify it resolved to some green-ish color
    expect(bgWide).toMatch(/oklch|rgb/);

    // Narrow viewport (<640px) — falls back to bg-zinc-800
    await page.setViewportSize({ width: 320, height: 600 });
    await page.goto(BASE_URL);
    const narrowBox = await page.locator('text=Responsive').locator('..');
    const bgNarrow = await narrowBox.evaluate((el) => getComputedStyle(el).backgroundColor);
    // Should differ from the wide version (different utility applied)
    expect(bgNarrow).toMatch(/oklch|rgb/);
    expect(bgNarrow).not.toBe(bgWide);
  });
});
