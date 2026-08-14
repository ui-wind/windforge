#!/usr/bin/env node
/**
 * Windforge CLI entry point.
 *
 * Commands:
 *   windforge compile <fixture.json> [--output <file>]      Phase 0 IR fixture
 *   windforge generate <entry.css> [--output <dir>]         Phase 17 DX
 *                    [--dump-ir] [--platform native|web]
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { CompileError, compileFile } from './commands/compile.js';
import { generateCommand } from './commands/generate.js';
import { formatDiagnostic } from './diagnostics.js';

function usage(): string {
  return [
    'Usage: windforge <command> [options]',
    '',
    'Commands:',
    '  compile <input> [--output <file>]           Compile an IR fixture to canonical form (Phase 0)',
    '  generate <entry.css> [options]              Compile a CSS entry to Windforge artifacts (Phase 17)',
    '',
    'Generate options:',
    '  --output <dir>      Output directory (defaults to entry dir)',
    '  --dump-ir           Write artifact.json for IR inspection',
    '  --platform <name>   Target platform: native | web (default native)',
    '',
  ].join('\n');
}

async function runGenerate(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: 'string', short: 'o' },
      'dump-ir': { type: 'boolean' },
      platform: { type: 'string' },
    },
    allowPositionals: true,
  });

  const entry = positionals[0];
  if (entry === undefined) {
    process.stderr.write(`generate requires an entry CSS file\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }

  const platform = values.platform;
  if (platform !== undefined && platform !== 'native' && platform !== 'web') {
    process.stderr.write(`--platform must be "native" or "web", got "${platform}"\n`);
    process.exitCode = 1;
    return;
  }

  const result = await generateCommand({
    entry,
    output: values.output,
    dumpIr: values['dump-ir'],
    platform: platform ?? undefined,
  });

  const hasErrors = result.diagnostics.some((d) => d.code === 'WF0010');
  for (const diagnostic of result.diagnostics) {
    const severity = hasErrors ? 'error' : 'warning';
    process.stderr.write(`${formatDiagnostic({ severity, ...diagnostic })}\n`);
  }

  if (hasErrors) {
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`wrote ${result.jsPath}\n`);
  if (result.irPath !== undefined) {
    process.stdout.write(`wrote ${result.irPath} (IR dump)\n`);
  }
}

function runCompile(args: string[]): void {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: 'string', short: 'o' },
    },
    allowPositionals: true,
  });

  const input = positionals[0];
  if (input === undefined) {
    process.stderr.write(`compile requires an input file\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = compileFile({ input });
    for (const diagnostic of result.diagnostics) {
      process.stderr.write(`${formatDiagnostic(diagnostic)}\n`);
    }
    const output = `${result.canonical}\n`;
    if (values.output !== undefined) {
      writeFileSync(values.output, output, 'utf8');
      process.stdout.write(`wrote ${values.output} (hash ${result.hash})\n`);
    } else {
      process.stdout.write(output);
      process.stdout.write(`hash: ${result.hash}\n`);
    }
  } catch (error) {
    if (error instanceof CompileError) {
      process.stderr.write(`${formatDiagnostic(error.diagnostic)}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(usage());
    process.exitCode = command === undefined ? 1 : 0;
    return;
  }

  if (command === 'compile') {
    runCompile(args.slice(1));
    return;
  }

  if (command === 'generate') {
    await runGenerate(args.slice(1));
    return;
  }

  process.stderr.write(`unknown command: ${command}\n\n${usage()}`);
  process.exitCode = 1;
}

main();
