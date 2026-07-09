#!/usr/bin/env node
/**
 * Cross-platform clean script.
 * Replaces Unix `rm -rf` for the monorepo build artifacts.
 *
 * Usage: node scripts/clean.mjs
 */

import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

const dirs = [
  'packages/core/dist',
  'apps/server/dist',
  'apps/desktop/dist',
  'node_modules/.cache',
  'node-compile-cache',
];

for (const d of dirs) {
  const fullPath = resolve(root, d);
  try {
    rmSync(fullPath, { recursive: true, force: true });
    console.log(`[clean] removed ${d}`);
  } catch {
    // path didn't exist — fine
  }
}
