#!/usr/bin/env node
/**
 * Cross-platform copy-templates script.
 * Replaces Unix `cp -r src/agents/prompts/templates dist/agents/prompts/`
 *
 * Usage: node scripts/copy-templates.mjs
 */

import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const src = resolve(__dirname, '../packages/core/src/agents/prompts/templates');
const dest = resolve(__dirname, '../packages/core/dist/agents/prompts/templates');

if (!existsSync(src)) {
  console.error(`[copy-templates] source not found: ${src}`);
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });

const files = readdirSync(dest);
console.log(`[copy-templates] copied ${files.length} template(s) to dist/agents/prompts/templates/`);
