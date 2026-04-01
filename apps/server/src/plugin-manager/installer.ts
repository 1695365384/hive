/**
 * Plugin Installer — 多来源安装
 *
 * 安全措施：
 * - 使用 execFile（异步）防止阻塞事件循环
 * - 路径穿越检查（isPathSafe）
 * - Git URL 域名白名单（isGitUrlTrusted）
 * - 安装失败自动回滚
 */

import { spawn } from 'child_process'
import { existsSync, readFileSync, cpSync, rmSync, mkdirSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { PLUGINS_DIR, CONFIG_PATH, isPathSafe, isGitUrlTrusted, atomicWriteJSON } from './constants.js'
import { addPlugin } from './registry.js'
import type { PluginSource, InstallResult } from './types.js'

/**
 * 异步执行命令，输出透传到终端（不阻塞事件循环）
 */
function runCommand(cmd: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      cwd: options?.cwd,
    })

    const timer = options?.timeout
      ? setTimeout(() => {
          child.kill()
          reject(new Error(`Command timed out after ${options.timeout}ms`))
        }, options.timeout)
      : null

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`Command failed with exit code ${code}`))
    })

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })
  })
}

/**
 * 自动识别来源类型
 */
export function resolveSource(input: string): PluginSource {
  // Git URL: https://*, git://*, git@*
  if (/^https?:\/\//i.test(input) || /^git@/i.test(input) || /^git:\/\//i.test(input)) {
    const name = input.split('/').pop()?.replace(/\.git$/, '') ?? 'unknown'
    return { type: 'git', raw: input, resolved: input, targetName: name }
  }

  // Local path: ./*, ../*, /absolute
  if (/^\.\//i.test(input) || /^\.\.\//i.test(input) || /^\//i.test(input)) {
    const name = input.split('/').pop() ?? 'unknown'
    return { type: 'local', raw: input, resolved: resolve(input), targetName: name }
  }

  // npm package: @bundy-lmw/hive-plugin-xxx or name
  const name = input.replace(/^@bundy-lmw\/hive-plugin-/, '')
  return { type: 'npm', raw: input, resolved: input, targetName: name }
}

/**
 * 安装插件（统一入口）
 */
export async function installPlugin(input: string): Promise<InstallResult> {
  const source = resolveSource(input)

  // 路径穿越检查
  if (!isPathSafe(source.targetName)) {
    return { success: false, name: source.targetName, error: `Invalid plugin name: ${source.targetName}` }
  }

  const targetDir = resolve(PLUGINS_DIR, source.targetName)

  // 检查是否已安装
  const { hasPlugin } = await import('./registry.js')
  if (hasPlugin(source.targetName)) {
    return {
      success: false,
      name: source.targetName,
      error: 'Plugin already installed. Use `hive plugin update <name>` to upgrade.',
    }
  }

  try {
    switch (source.type) {
      case 'npm':
        return await installFromNpm(source, targetDir)
      case 'git':
        return await installFromGit(source, targetDir)
      case 'local':
        return await installFromLocal(source, targetDir)
    }
  } catch (error) {
    cleanupDir(targetDir)
    return {
      success: false,
      name: source.targetName,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * npm 包安装（异步执行，输出透传到终端）
 */
async function installFromNpm(source: PluginSource, targetDir: string): Promise<InstallResult> {
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true })
  }

  console.log(`  Installing ${source.resolved}...`)
  await runCommand('npm', ['install', '--prefix', targetDir, source.resolved], { timeout: 120_000 })

  const pluginInfo = validateInstalledPlugin(targetDir, source.resolved)
  if (!pluginInfo) {
    cleanupDir(targetDir)
    return { success: false, name: source.targetName, error: 'Not a valid Hive plugin (missing hive.plugin in package.json)' }
  }

  // 从 node_modules 下的包中复制 config.json 到插件根目录（作为配置模板）
  const templateConfig = readConfigTemplate(targetDir, source.resolved)
  copyConfigTemplate(targetDir, source.resolved)

  addPlugin(source.targetName, {
    source: `npm:${source.resolved}@${pluginInfo.version}`,
    installedAt: new Date().toISOString(),
    resolvedVersion: pluginInfo.version,
  })

  appendToConfig(source.targetName, templateConfig)

  return { success: true, name: source.targetName, packageName: source.resolved, version: pluginInfo.version }
}

/**
 * Git URL 安装
 */
async function installFromGit(source: PluginSource, targetDir: string): Promise<InstallResult> {
  if (!isGitUrlTrusted(source.resolved)) {
    return {
      success: false,
      name: source.targetName,
      error: `Untrusted git host. Only these are allowed: ${['github.com', 'gitlab.com', 'bitbucket.org', 'gitee.com', 'code.aliyun.com'].join(', ')}`,
    }
  }

  console.log(`  Cloning from ${source.resolved}`)
  console.log('  Press Ctrl+C to cancel, or Enter to continue...')
  await waitForEnter()

  const tmpDir = resolve(PLUGINS_DIR, `.tmp-${source.targetName}-${Date.now()}`)

  try {
    await runCommand('git', ['clone', '--depth', '1', source.resolved, tmpDir], { timeout: 60_000 })

    const pluginInfo = validateInstalledPlugin(tmpDir)
    if (!pluginInfo) {
      return { success: false, name: source.targetName, error: 'Not a valid Hive plugin (missing hive.plugin in package.json)' }
    }

    if (existsSync(resolve(tmpDir, 'package.json'))) {
      console.log('  Installing dependencies...')
      await runCommand('npm', ['install', '--production'], { cwd: tmpDir, timeout: 120_000 })
    }

    if (!existsSync(PLUGINS_DIR)) {
      mkdirSync(PLUGINS_DIR, { recursive: true })
    }
    cpSync(tmpDir, targetDir, { recursive: true })

    addPlugin(source.targetName, {
      source: `git:${source.resolved}`,
      installedAt: new Date().toISOString(),
      resolvedVersion: pluginInfo.version,
    })

    appendToConfig(source.targetName)

    return { success: true, name: source.targetName, version: pluginInfo.version }
  } finally {
    cleanupDir(tmpDir)
  }
}

/**
 * 本地路径安装
 */
async function installFromLocal(source: PluginSource, targetDir: string): Promise<InstallResult> {
  if (!existsSync(source.resolved)) {
    return { success: false, name: source.targetName, error: 'Path not found' }
  }

  const pluginInfo = validateInstalledPlugin(source.resolved)
  if (!pluginInfo) {
    return { success: false, name: source.targetName, error: 'Not a valid Hive plugin (missing hive.plugin in package.json)' }
  }

  if (!existsSync(PLUGINS_DIR)) {
    mkdirSync(PLUGINS_DIR, { recursive: true })
  }
  cpSync(source.resolved, targetDir, { recursive: true })

  addPlugin(source.targetName, {
    source: `local:${source.raw}`,
    installedAt: new Date().toISOString(),
    resolvedVersion: pluginInfo.version,
  })

  appendToConfig(source.targetName)

  return { success: true, name: source.targetName, version: pluginInfo.version }
}

/**
 * 验证已安装的插件是否合法
 */
function validateInstalledPlugin(dir: string, npmPkg?: string): { version: string; description?: string; homepage?: string } | null {
  // 1. 直接目录下的 package.json
  const directPkgPath = resolve(dir, 'package.json')
  if (existsSync(directPkgPath)) {
    const pkg = tryParsePkgJson(directPkgPath)
    if (pkg) return pkg
  }

  // 2. npm --prefix 安装：检查 node_modules/ 下的包
  const nmDir = resolve(dir, 'node_modules')
  if (!existsSync(nmDir)) return null

  return findPluginInNodeModules(nmDir)
}

/**
 * 在 node_modules 中查找合法插件
 */
function findPluginInNodeModules(nmDir: string): { version: string; description?: string; homepage?: string } | null {
  const entries = readdirSync(nmDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    if (entry.name.startsWith('@')) {
      const scopeDir = resolve(nmDir, entry.name)
      if (!existsSync(scopeDir)) continue
      const scopeEntries = readdirSync(scopeDir, { withFileTypes: true })
      for (const pkg of scopeEntries) {
        if (!pkg.isDirectory()) continue
        const result = tryParsePkgJson(resolve(scopeDir, pkg.name, 'package.json'))
        if (result) return result
      }
    } else {
      const result = tryParsePkgJson(resolve(nmDir, entry.name, 'package.json'))
      if (result) return result
    }
  }
  return null
}

function tryParsePkgJson(pkgPath: string): { version: string; description?: string; homepage?: string } | null {
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    if (!pkg.hive?.plugin) return null
    return { version: pkg.version || '0.0.0', description: pkg.description, homepage: pkg.homepage }
  } catch {
    return null
  }
}

/**
 * 将插件添加到 hive.config.json（原子写入）
 * 使用 hive.id（即 targetName）作为 config key
 */
function appendToConfig(pluginId: string, templateConfig?: Record<string, unknown>): void {
  if (!existsSync(CONFIG_PATH)) return

  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8')
    const config = JSON.parse(content)
    if (!config.plugins) {
      config.plugins = {}
    }
    if (!(pluginId in config.plugins)) {
      config.plugins[pluginId] = templateConfig ?? {}
      atomicWriteJSON(CONFIG_PATH, config)
    }
  } catch {
    console.warn('[plugin-installer] Failed to update hive.config.json')
  }
}

function cleanupDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * 从已安装的 npm 包中读取 config.json 模板内容
 */
function readConfigTemplate(targetDir: string, npmPackage: string): Record<string, unknown> | undefined {
  const nmDir = resolve(targetDir, 'node_modules')
  if (!existsSync(nmDir)) return undefined

  const pkgPath = npmPackage.startsWith('@')
    ? resolve(nmDir, npmPackage)
    : resolve(nmDir, npmPackage)

  const srcConfig = resolve(pkgPath, 'config.json')
  if (!existsSync(srcConfig)) return undefined

  try {
    return JSON.parse(readFileSync(srcConfig, 'utf-8'))
  } catch {
    return undefined
  }
}

/**
 * 从已安装的 npm 包中复制 config.json 到插件根目录（作为配置模板）
 */
function copyConfigTemplate(targetDir: string, npmPackage: string): void {
  const nmDir = resolve(targetDir, 'node_modules')
  if (!existsSync(nmDir)) return

  // 解析包路径（如 @bundy-lmw/hive-plugin-feishu）
  const pkgPath = npmPackage.startsWith('@')
    ? resolve(nmDir, npmPackage)
    : resolve(nmDir, npmPackage)

  const srcConfig = resolve(pkgPath, 'config.json')
  if (!existsSync(srcConfig)) return

  const dstConfig = resolve(targetDir, 'config.json')
  if (!existsSync(dstConfig)) {
    cpSync(srcConfig, dstConfig)
  }
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const onData = () => {
      process.stdin.removeListener('data', onData)
      process.stdin.pause()
      resolve()
    }
    process.stdin.resume()
    process.stdin.once('data', onData)
  })
}
