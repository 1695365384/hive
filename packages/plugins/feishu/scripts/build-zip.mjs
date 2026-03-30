/**
 * 插件构建 + 打包
 *
 * 1. esbuild 打包源码为单文件（含所有依赖）
 * 2. 写入 package.json（hive 声明）和 config.json（配置模板）
 * 3. 调用 pack.mjs 压缩为 ZIP
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'

const ROOT = resolve(import.meta.dirname, '..')
const PACK_DIR = resolve(ROOT, '.pack')

// 1. 清理临时目录
rmSync(PACK_DIR, { recursive: true, force: true })
mkdirSync(PACK_DIR, { recursive: true })

// 2. esbuild 打包
execSync(
  'npx esbuild src/index.ts --bundle --platform=node --format=esm'
  + ` --outfile="${resolve(PACK_DIR, 'dist/index.js')}"`
  + ' --external:@hive/core'
  + ' --banner:js="import{createRequire}from\'module\';const require=createRequire(import.meta.url);"',
  { cwd: ROOT, stdio: 'inherit' },
)

// 3. 写入 package.json
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'))
writeFileSync(resolve(PACK_DIR, 'package.json'), JSON.stringify({
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  type: 'module',
  hive: { plugin: true, entry: 'dist/index.js' },
}, null, 2) + '\n')

// 4. 写入 config.json 模板
writeFileSync(resolve(PACK_DIR, 'config.json'), JSON.stringify({
  apps: [{ appId: '', appSecret: '' }],
}, null, 2) + '\n')

// 5. 压缩为 ZIP
execSync(`node "${resolve(ROOT, 'scripts/pack.mjs')}" "${PACK_DIR}"`, { stdio: 'inherit' })

// 6. 清理临时目录
rmSync(PACK_DIR, { recursive: true, force: true })
