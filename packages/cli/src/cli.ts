#!/usr/bin/env node
/**
 * Windforge CLI entry point.
 *
 * Phase 0 commands:
 *   windforge compile <fixture.json> [--output <file>]
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { CompileError, compileFile } from './commands/compile.js';
import { formatDiagnostic } from './diagnostics.js';

function usage(): string {
  return [
    'Usage: windforge <command> [options]',
    '',
    'Commands:',
    '  compile <input> [--output <file>]   Compile an IR fixture to canonical form (Phase 0)',
    '',
  ].join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(usage());
    process.exitCode = command === undefined ? 1 : 0;
    return;
  }

  if (command !== 'compile') {
    process.stderr.write(`unknown command: ${command}\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }

  const { values, positionals } = parseArgs({
    args: args.slice(1),
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

main();
