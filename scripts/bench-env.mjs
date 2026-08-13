#!/usr/bin/env node
/**
 * Prints a paste-ready reproducibility record for benchmark entries
 * (docs/reference/BENCHMARK_RECORDS.md). Zero dependencies on purpose:
 * node:os + node:child_process + node:fs only, so it runs from a clean
 * checkout before `pnpm install` completes or in CI.
 *
 * Usage: node scripts/bench-env.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, relativePath), 'utf8'));
  } catch {
    return {};
  }
}

const commit = git('rev-parse --short HEAD');
const dirty = git('status --porcelain') ? ' (dirty working tree)' : '';
const cpu = cpus()[0];
const example = readJson('apps/example/package.json');
const tailwindPkg = readJson('packages/tailwind/package.json');

const exampleDeps = { ...example.dependencies, ...example.devDependencies };
const stackKeys = [
  'expo',
  'react-native',
  'react',
  'react-native-web',
  'react-native-reanimated',
  'react-native-worklets',
];
const compilerKeys = ['tailwindcss', '@tailwindcss/oxide', 'lightningcss'];

const lines = [];
lines.push('| Field | Value |');
lines.push('|---|---|');
lines.push(`| Date | ${new Date().toISOString()} |`);
lines.push(`| Commit | ${commit}${dirty} |`);
lines.push(`| Node | ${process.version} |`);
lines.push(`| OS | ${platform()} ${release()} |`);
lines.push(`| CPU | ${cpu.model} (${cpus().length} cores) |`);
lines.push(`| Memory | ${(totalmem() / 1024 ** 3).toFixed(1)} GiB |`);
for (const key of stackKeys) {
  if (exampleDeps[key]) lines.push(`| ${key} | ${exampleDeps[key]} |`);
}
for (const key of compilerKeys) {
  const version = tailwindPkg.dependencies?.[key];
  if (version) lines.push(`| ${key} | ${version} (declared) |`);
}

console.log(lines.join('\n'));
