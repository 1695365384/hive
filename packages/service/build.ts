/**
 * esbuild 打包脚本
 *
 * 将 TypeScript 源码打包为单文件
 */

import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';

const ROOT_DIR = path.dirname(import.meta.url.replace('file://', ''));
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const BINARIES_DIR = path.join(ROOT_DIR, '..', 'app', 'src-tauri', 'binaries');
const PROJECT_ROOT = path.join(ROOT_DIR, '..', '..');

async function build() {
  console.log('Building service...');

  // 确保 dist 目录存在
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  // esbuild 打包
  await esbuild.build({
    entryPoints: [path.join(ROOT_DIR, 'src', 'index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: path.join(DIST_DIR, 'service.js'),
    // 打包所有依赖，包括 @aiclaw/core
    // 注意：Node.js 内置模块会自动处理
    minify: false,
    sourcemap: true,
  });

  console.log('Build completed successfully!');
  console.log(`Output: ${path.join(DIST_DIR, 'service.js')}`);

  // 复制 providers.json 到 binaries 目录
  const providersSource = path.join(PROJECT_ROOT, 'providers.json');
  const providersTarget = path.join(BINARIES_DIR, 'providers.json');

  if (fs.existsSync(providersSource)) {
    // 确保 binaries 目录存在
    if (!fs.existsSync(BINARIES_DIR)) {
      fs.mkdirSync(BINARIES_DIR, { recursive: true });
    }
    fs.copyFileSync(providersSource, providersTarget);
    console.log(`Copied providers.json to ${providersTarget}`);
  } else {
    console.warn(`Warning: providers.json not found at ${providersSource}`);
  }
}

// 运行构建
build().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
