/**
 * `windforge generate` — Phase 17 DX: compile CSS entry to Windforge artifacts.
 *
 * Runs the full Tailwind v4 compile pipeline (source discovery → CSS → IR →
 * artifact) and emits the generated JS module + optional IR dump for
 * inspection/debugging.
 */
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generate, type GenerateOptions } from '@windforge/tailwind';
import { renderArtifactModule } from '@windforge/tailwind';

export type GenerateInput = {
  /** Entry CSS file path. */
  entry: string;
  /** Output directory for generated files. Defaults to entry dir. */
  output?: string | undefined;
  /** Dump the runtime artifact as JSON for inspection. */
  dumpIr?: boolean | undefined;
  /** Platform target. */
  platform?: 'native' | 'web' | undefined;
};

export type GenerateResult = {
  /** Path to the generated JS module. */
  jsPath: string;
  /** Path to the dumped IR JSON (if --dump-ir). */
  irPath?: string | undefined;
  diagnostics: Array<{ code: string; message: string }>;
};

export async function generateCommand(options: GenerateInput): Promise<GenerateResult> {
  const entryPath = resolve(options.entry);
  const outDir = options.output ? resolve(options.output) : dirname(entryPath);

  // Validate entry exists before running the pipeline.
  try {
    statSync(entryPath);
  } catch {
    return {
      jsPath: '',
      diagnostics: [{ code: 'WF0010', message: `entry file not found: ${entryPath}` }],
    };
  }

  const generateOptions: GenerateOptions = {
    entry: entryPath,
    base: dirname(entryPath),
    platform: options.platform ?? 'native',
  };

  const diagnostics: Array<{ code: string; message: string }> = [];
  generateOptions.onDependency = () => {}; // CLI doesn't track deps

  const result = await generate(generateOptions);
  for (const d of result.diagnostics) {
    diagnostics.push({ code: d.code, message: d.message });
  }

  // Emit generated JS module
  mkdirSync(outDir, { recursive: true });
  const jsPath = resolve(outDir, 'generated.js');
  writeFileSync(jsPath, renderArtifactModule(result.artifact), 'utf8');

  let irPath: string | undefined;
  if (options.dumpIr) {
    irPath = resolve(outDir, 'artifact.json');
    writeFileSync(irPath, JSON.stringify(result.artifact, null, 2), 'utf8');
  }

  return { jsPath, irPath, diagnostics };
}
