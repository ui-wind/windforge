#!/usr/bin/env node
/**
 * Sample exact pixel colors from a PNG screenshot.
 *
 * Used by the iOS / Android / Web verification runbooks to assert that a
 * rendered screen shows a known color (e.g. Home root background #09090b,
 * accent #3b82f6) instead of eyeballing screenshots.
 *
 * Usage:
 *   node scripts/pixel-sample.mjs <file.png> <x,y> [x,y ...]
 *
 * Prints one `#rrggbb` per coordinate, in order. Coordinates are 0-based
 * from the top-left. Exits non-zero if the file is unreadable or a
 * coordinate is out of range.
 */
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [file, ...coords] = process.argv.slice(2);

if (!file || coords.length === 0) {
  console.error('Usage: node scripts/pixel-sample.mjs <file.png> <x,y> [x,y ...]');
  process.exit(2);
}

let png;
try {
  png = PNG.sync.read(readFileSync(file));
} catch (error) {
  console.error(`Failed to read PNG ${file}: ${error.message}`);
  process.exit(2);
}

const { width, height, data } = png;

for (const coord of coords) {
  const [x, y] = coord.split(',').map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
    console.error(`${coord}: out of range (${width}×${height})`);
    process.exit(2);
  }
  const index = (y * width + x) * 4;
  const hex = (n) => n.toString(16).padStart(2, '0');
  console.log(`#${hex(data[index])}${hex(data[index + 1])}${hex(data[index + 2])}`);
}
