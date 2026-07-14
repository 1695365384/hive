#!/usr/bin/env node
/**
 * Cross-platform SEA bundle script.
 * Replaces apps/server/scripts/bundle.sh — works on Windows, macOS, Linux.
 *
 * Usage: node apps/server/scripts/bundle.mjs
 *
 * Environment:
 *   SEA_ARCH    — override target arch (default: host arch)
 */

import { execSync } from 'node:child_process';
import {
  copyFileSync, cpSync, existsSync, mkdirSync, readFileSync,
  readdirSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arch, platform } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_ROOT = resolve(__dirname, '..');
const PNPM_STORE = resolve(SERVER_ROOT, '../../node_modules/.pnpm');
const OUT_DIR = resolve(SERVER_ROOT, 'bundle');
const CORE_DIST = resolve(SERVER_ROOT, '../../packages/core/dist');

// ── Platform detection ──────────────────────────────────
const hostArch = arch();
const desiredArch = process.env.SEA_ARCH || hostArch;

const platformMap = {
  win32:   { os: 'win32',  nodeArch: 'win-x64',   sep: '\\' },
  darwin:  { os: 'darwin', nodeArch: 'darwin-x64', sep: '/'  },
  linux:   { os: 'linux',  nodeArch: 'linux-x64',  sep: '/'  },
};

const archMap = {
  x64:  { nodeArch: 'x64',    rustArch: 'x86_64' },
  arm64: { nodeArch: 'arm64',  rustArch: 'aarch64' },
};

const plat = platform();
const platKey = plat === 'win32' ? 'win32' : plat === 'darwin' ? 'darwin' : 'linux';
const pInfo = platformMap[platKey];
if (!pInfo) {
  console.error(`[bundle] Unsupported platform: ${plat}`);
  process.exit(1);
}

const aInfo = archMap[desiredArch];
if (!aInfo) {
  console.error(`[bundle] Unsupported arch: ${desiredArch}`);
  process.exit(1);
}

const NODE_ARCH = `${platKey === 'win32' ? 'win' : platKey}-${aInfo.nodeArch}`;
console.log(`[bundle] Platform: ${plat}, Arch: ${desiredArch}, Node arch: ${NODE_ARCH}`);

// ── Find native module ──────────────────────────────────
let nativeSrc = null;
if (existsSync(PNPM_STORE)) {
  const entries = readdirSync(PNPM_STORE);
  const match = entries.find(e => e.startsWith('better-sqlite3@'));
  if (match) {
    nativeSrc = resolve(PNPM_STORE, match, 'node_modules/better-sqlite3');
  }
}
if (!nativeSrc || !existsSync(nativeSrc)) {
  console.error(`[bundle] ERROR: better-sqlite3 not found in ${PNPM_STORE}`);
  console.error('[bundle] Make sure pnpm install has been run.');
  process.exit(1);
}

// ── Step 0: Clean ───────────────────────────────────────
console.log('[bundle] Cleaning output dir...');
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

// Mark bundle as CJS (overrides parent "type": "module")
writeFileSync(join(OUT_DIR, 'package.json'), JSON.stringify({ type: 'commonjs' }));

// ── Step 1: esbuild bundle ──────────────────────────────
console.log('[bundle] Step 1: esbuild bundle...');

const esbuildCmd = [
  `pnpm --filter @bundy-lmw/hive-server exec esbuild`,
  `"${resolve(SERVER_ROOT, 'src/main.ts')}"`,
  '--bundle',
  '--platform=node',
  '--target=node22',
  '--format=cjs',
  `--outfile="${join(OUT_DIR, 'main.js')}"`,
  '--external:better-sqlite3',
  '--log-level=info',
  "--define:process.env.NODE_ENV='production'",
].join(' ');

execSync(esbuildCmd, { stdio: 'inherit', cwd: SERVER_ROOT, shell: true });

// Remove source map
try { rmSync(join(OUT_DIR, 'main.js.map'), { force: true }); } catch {}

// Patch import_meta for CJS
const mainJsPath = join(OUT_DIR, 'main.js');
let mainJs = readFileSync(mainJsPath, 'utf-8');
mainJs = mainJs.replace(
  /(import_meta\d*)\s*=\s*\{\}/g,
  `$1 = { url: require("url").pathToFileURL(__filename).href }`,
);
writeFileSync(mainJsPath, mainJs);

const bundleSize = (readFileSync(mainJsPath).length / 1024 / 1024).toFixed(1);
console.log(`[bundle] Bundle: main.js (${bundleSize} MB)`);

// ── Step 2: Copy native module ──────────────────────────
console.log('[bundle] Step 2: Copy native module...');
const nativeOut = join(OUT_DIR, 'node_modules/better-sqlite3');
mkdirSync(join(nativeOut, 'lib'), { recursive: true });
mkdirSync(join(nativeOut, 'build'), { recursive: true });

cpSync(join(nativeSrc, 'lib'), join(nativeOut, 'lib'), { recursive: true });
cpSync(join(nativeSrc, 'build'), join(nativeOut, 'build'), { recursive: true });
copyFileSync(join(nativeSrc, 'package.json'), join(nativeOut, 'package.json'));

// Patch better-sqlite3 to load native addon directly (skip 'bindings' library)
const dbJsPath = join(nativeOut, 'lib/database.js');
if (existsSync(dbJsPath)) {
  let dbJs = readFileSync(dbJsPath, 'utf-8');
  dbJs = dbJs.replace(
    /require\('bindings'\)\('better_sqlite3\.node'\)/g,
    `require(__dirname + '/../build/Release/better_sqlite3.node')`,
  );
  writeFileSync(dbJsPath, dbJs);
}

console.log('[bundle] Native: node_modules/better-sqlite3');

// ── Step 3: Copy prompt templates ───────────────────────
console.log('[bundle] Step 3: Copying prompt templates...');
const templatesSrc = join(CORE_DIST, 'agents/prompts/templates');
const templatesOut = join(OUT_DIR, 'templates');

if (existsSync(templatesSrc)) {
  mkdirSync(templatesOut, { recursive: true });
  const files = readdirSync(templatesSrc);
  let count = 0;
  for (const f of files) {
    if (f.endsWith('.md')) {
      copyFileSync(join(templatesSrc, f), join(templatesOut, f));
      count++;
    }
  }
  console.log(`[bundle] Templates: ${count} .md files copied to templates/`);
} else {
  console.warn('[bundle] Warning: templates source not found — skipping');
}

// ── Step 4: Download Node.js binary ─────────────────────
console.log('[bundle] Step 4: Downloading Node.js binary...');

const nodeVersion = execSync('node -v', { encoding: 'utf-8' }).trim().replace(/^v/, '');
const isWindows = plat === 'win32';
// Windows CreateProcess appends .exe when path has no extension — ship as node-win-x64.exe
const nodeSideName = isWindows ? `node-${NODE_ARCH}.exe` : `node-${NODE_ARCH}`;
const tmpDir = resolve(OUT_DIR, '..', '.tmp-bundle');

mkdirSync(tmpDir, { recursive: true });

let nodeBinPath;
if (isWindows) {
  const zipName = `node-v${nodeVersion}-${NODE_ARCH}.zip`;
  const zipPath = join(tmpDir, zipName);
  const extractedDir = join(tmpDir, `node-v${nodeVersion}-${NODE_ARCH}`);

  if (!existsSync(join(extractedDir, 'node.exe'))) {
    const url = `https://nodejs.org/dist/v${nodeVersion}/${zipName}`;
    console.log(`[bundle] Downloading ${url}...`);
    execSync(`curl -fsSL "${url}" -o "${zipPath}"`, { stdio: 'inherit', shell: true });
    execSync(`tar -xf "${zipPath}" -C "${tmpDir}"`, { stdio: 'inherit', shell: true });
    rmSync(zipPath, { force: true });
  }
  nodeBinPath = join(extractedDir, 'node.exe');
} else {
  const tarName = `node-v${nodeVersion}-${NODE_ARCH}.tar.gz`;
  const tarPath = join(tmpDir, tarName);
  const extractedDir = join(tmpDir, `node-v${nodeVersion}-${NODE_ARCH}`);

  if (!existsSync(join(extractedDir, 'bin', 'node'))) {
    const url = `https://nodejs.org/dist/v${nodeVersion}/${tarName}`;
    console.log(`[bundle] Downloading ${url}...`);
    execSync(`curl -fsSL "${url}" -o "${tarPath}"`, { stdio: 'inherit', shell: true });
    execSync(`tar -xf "${tarPath}" -C "${tmpDir}"`, { stdio: 'inherit', shell: true });
    rmSync(tarPath, { force: true });
  }
  nodeBinPath = join(extractedDir, 'bin', 'node');
}

copyFileSync(nodeBinPath, join(OUT_DIR, nodeSideName));
if (!isWindows) {
  // chmod +x equivalent
  execSync(`chmod +x "${join(OUT_DIR, nodeSideName)}"`, { shell: true });
}

const binarySize = (readFileSync(join(OUT_DIR, nodeSideName)).length / 1024 / 1024).toFixed(1);

// Calculate total size
let totalSize = '?';
try {
  const sizeOut = execSync(
    isWindows
      ? `powershell -c "(Get-ChildItem -Recurse '${OUT_DIR}' | Measure-Object -Property Length -Sum).Sum / 1MB"`
      : `du -sh "${OUT_DIR}" | cut -f1`,
    { encoding: 'utf-8', shell: true },
  ).trim();
  totalSize = sizeOut;
} catch {}

// Cleanup tmp
rmSync(tmpDir, { recursive: true, force: true });

console.log(`[bundle] Node.js binary: ${nodeSideName} (${binarySize} MB)`);
console.log(`[bundle] Done! Output: bundle/ (${totalSize})`);
console.log('[bundle] Ship: bundle/ directory (main.js + node_modules/ + templates/ + ' + nodeSideName + ')');
