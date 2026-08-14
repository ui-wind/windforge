/**
 * Watch mode — `compileWindforge({ watch })` regenerates the artifact when
 * source files or CSS `@import` dependencies change. Metro then invalidates
 * `windforge/generated` on its own; these tests only verify the compiler
 * side against temp project dirs.
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { compileWindforge } from '../src/index.js';

const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, ms));

async function waitFor(
  check: () => Promise<boolean> | boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(25);
  }
  throw new Error('waitFor timed out');
}

const stops: Array<(() => void) | undefined> = [];
const tempDirs: string[] = [];

async function makeProject(): Promise<{
  dir: string;
  entry: string;
  appFile: string;
  outputFile: string;
}> {
  const dir = await mkdtemp(resolve(tmpdir(), 'windforge-watch-'));
  tempDirs.push(dir);
  const srcDir = resolve(dir, 'src');
  await mkdir(srcDir, { recursive: true });
  const entry = resolve(srcDir, 'global.css');
  const appFile = resolve(srcDir, 'App.tsx');
  await writeFile(entry, "@import 'tailwindcss';\n");
  await writeFile(appFile, 'export const cls = "p-4";\n');
  return { dir, entry, appFile, outputFile: resolve(dir, '.windforge/generated.js') };
}

async function startWatch(
  project: Awaited<ReturnType<typeof makeProject>>,
  onRebuild?: () => void,
) {
  const result = await compileWindforge({
    entry: project.entry,
    base: project.dir,
    outputDir: resolve(project.dir, '.windforge'),
    diagnostics: false,
    watch: true,
    onRebuild,
  });
  stops.push(result.stop);
  return result;
}

afterEach(() => {
  while (stops.length > 0) stops.pop()?.();
});

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('compileWindforge({ watch })', () => {
  it('regenerates the artifact when a source file changes', async () => {
    const project = await makeProject();
    await startWatch(project);

    const initial = await readFile(project.outputFile, 'utf8');
    expect(initial).toContain('"p-4"');
    expect(initial).not.toContain('"bg-rose-500"');

    await writeFile(project.appFile, 'export const cls = "p-4 bg-rose-500";\n');
    await waitFor(async () =>
      (await readFile(project.outputFile, 'utf8')).includes('"bg-rose-500"'),
    );
    expect(await readFile(project.outputFile, 'utf8')).toContain('"p-4"');
  });

  it('picks up newly added source files', async () => {
    const project = await makeProject();
    await startWatch(project);

    await writeFile(resolve(project.dir, 'src/New.tsx'), 'export const cls = "bg-amber-500";\n');
    await waitFor(async () =>
      (await readFile(project.outputFile, 'utf8')).includes('"bg-amber-500"'),
    );
  });

  it('coalesces bursty changes into a single rebuild (debounce)', async () => {
    const project = await makeProject();
    let rebuilds = 0;
    await startWatch(project, () => {
      rebuilds += 1;
    });

    // Two writes back to back — well inside the 100ms debounce window.
    await writeFile(project.appFile, 'export const cls = "p-4 m-2";\n');
    await writeFile(project.appFile, 'export const cls = "p-4 m-4";\n');
    await waitFor(async () =>
      (await readFile(project.outputFile, 'utf8')).includes('"m-4"'),
    );
    await sleep(300); // settle window: no second rebuild may follow
    expect(rebuilds).toBe(1);
  });

  it('skips the artifact write when the regenerated module is unchanged', async () => {
    const project = await makeProject();
    let rebuilds = 0;
    await startWatch(project, () => {
      rebuilds += 1;
    });

    const before = await stat(project.outputFile);
    await sleep(50); // any real write would land on a later mtime
    // Comment-only change: candidates and artifact bytes stay identical.
    await writeFile(project.appFile, 'export const cls = "p-4"; // unchanged classes\n');
    await waitFor(() => rebuilds >= 1);
    const after = await stat(project.outputFile);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it('regenerates when a CSS @import dependency outside base changes', async () => {
    const outer = await mkdtemp(resolve(tmpdir(), 'windforge-watch-dep-'));
    tempDirs.push(outer);
    const appDir = resolve(outer, 'app');
    const srcDir = resolve(appDir, 'src');
    await mkdir(srcDir, { recursive: true });
    const themeFile = resolve(outer, 'theme.css'); // outside the watched base
    await writeFile(themeFile, '@theme { --color-brand: #22c55e; }\n');
    const entry = resolve(srcDir, 'global.css');
    await writeFile(entry, "@import 'tailwindcss';\n@import '../../theme.css';\n");
    const appFile = resolve(srcDir, 'App.tsx');
    await writeFile(appFile, 'export const cls = "p-4 bg-brand";\n');
    const outputFile = resolve(appDir, '.windforge/generated.js');

    const result = await compileWindforge({
      entry,
      base: appDir,
      outputDir: resolve(appDir, '.windforge'),
      diagnostics: false,
      watch: true,
    });
    stops.push(result.stop);

    expect(await readFile(outputFile, 'utf8')).toContain('#22c55e');
    await writeFile(themeFile, '@theme { --color-brand: #ef4444; }\n');
    await waitFor(async () => (await readFile(outputFile, 'utf8')).includes('#ef4444'));
  });

  it('stop() detaches the watcher', async () => {
    const project = await makeProject();
    let rebuilds = 0;
    const { stop } = await startWatch(project, () => {
      rebuilds += 1;
    });
    stop?.();

    const before = await readFile(project.outputFile, 'utf8');
    await sleep(50);
    await writeFile(project.appFile, 'export const cls = "p-4 bg-cyan-500";\n');
    await sleep(500); // comfortably past debounce + rebuild time
    expect(rebuilds).toBe(0);
    expect(await readFile(project.outputFile, 'utf8')).toBe(before);
  });
});
