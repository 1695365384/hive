/**
 * OfficeCLI 自动集成模块
 *
 * officecli 作为 npm 依赖打包在 apps/server 的 node_modules 中，
 * `pnpm install` 时自动下载平台二进制（从 d.officecli.ai CDN）。
 *
 * Hive 启动时自动：
 * 1. 解析本地 node_modules 中的 officecli 二进制路径
 * 2. 安装内联打包的 SKILL.md 到 .hive/skills/（不依赖网络）
 * 3. 注册 officecli MCP 服务器，Agent 自动获得 Office 文档操作工具
 *
 * 全过程非阻塞——失败只 log warning，不影响 server 启动。
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import type { Agent } from '@bundy-lmw/hive-core'
import { OFFICECLI_SKILL_CONTENT } from './officecli-skill-content.js'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)

/** 国内 npm 镜像（fallback 全局安装时使用） */
const NPM_MIRROR_REGISTRY = 'https://registry.npmmirror.com'

// ============================================
// 二进制路径解析
// ============================================

/** officecli 可用性缓存 */
let _available: boolean | null = null
/** 解析后的二进制命令缓存 */
let _command: { command: string; baseArgs: string[] } | null = null

/**
 * 解析 officecli 二进制命令。
 *
 * 优先从本地 node_modules 解析（pnpm install 时已下载），
 * 其次检查全局 PATH。
 *
 * @returns { command, baseArgs } — 执行 officecli 时用 command + [...baseArgs, ...extraArgs]
 *          null 如果找不到
 */
export function getOfficeCliCommand(): { command: string; baseArgs: string[] } | null {
  if (_command !== null) return _command

  // 1. 尝试本地 node_modules（@officecli/officecli 包的 JS wrapper）
  try {
    const mainPath = require.resolve('@officecli/officecli')
    // mainPath = .../node_modules/@officecli/officecli/lib/install-binary.js
    // bin wrapper 在包根目录的 officecli.js
    const pkgDir = dirname(dirname(mainPath))
    const binPath = join(pkgDir, 'officecli.js')
    _command = { command: 'node', baseArgs: [binPath] }
    return _command
  } catch {
    // 本地未安装
  }

  // 2. 尝试全局 PATH（兼容用户手动 npm install -g 的场景）
  _command = { command: 'officecli', baseArgs: [] }
  return _command
}

/**
 * 检查 officecli 二进制是否可用（实际执行 --version）
 */
export async function isOfficeCliAvailable(): Promise<boolean> {
  if (_available !== null) return _available

  const cmd = getOfficeCliCommand()
  if (!cmd) {
    _available = false
    return false
  }

  try {
    await execFileAsync(cmd.command, [...cmd.baseArgs, '--version'], { timeout: 5000 })
    _available = true
  } catch {
    _available = false
  }
  return _available
}

/**
 * 通过 npm 全局安装 officecli（fallback，本地二进制不可用时）
 *
 * 策略：
 * 1. 先用当前 npm 配置尝试
 * 2. 失败则用 npmmirror.com 镜像重试
 */
async function installViaNpm(): Promise<boolean> {
  let success = await tryNpmInstall([])
  if (success) return true

  console.log('[officecli] Default registry failed, trying npmmirror.com...')
  success = await tryNpmInstall(['--registry', NPM_MIRROR_REGISTRY])
  if (success) return true

  console.warn(
    '[officecli] npm install failed on both registries.\n' +
    'Manual install: npm install -g @officecli/officecli --registry ' + NPM_MIRROR_REGISTRY
  )
  return false
}

/** 执行 npm install，返回是否成功 */
async function tryNpmInstall(extraArgs: string[]): Promise<boolean> {
  try {
    const args = ['install', '-g', '@officecli/officecli', ...extraArgs]
    console.log('[officecli] Running: npm', args.join(' '))
    await execFileAsync('npm', args, {
      timeout: 180_000,
      env: { ...process.env },
    })
    console.log('[officecli] npm install complete')
    // 重置缓存——全局安装后 command 解析方式不变，但可用性需要重新检查
    _available = null
    _command = null // 重新解析，优先用本地
    return await isOfficeCliAvailable()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn(`[officecli] npm install failed: ${msg.slice(0, 200)}`)
    return false
  }
}

// ============================================
// Skill 安装
// ============================================

/**
 * 安装内联打包的 SKILL.md 到 .hive/skills/ 目录（不依赖网络）
 */
async function installSkill(): Promise<void> {
  const skillsDir = join(process.cwd(), '.hive', 'skills')
  const skillPath = join(skillsDir, 'officecli.md')

  // 已存在则跳过
  try {
    await access(skillPath)
    return
  } catch {
    // not found — proceed
  }

  try {
    await mkdir(skillsDir, { recursive: true })
    await writeFile(skillPath, OFFICECLI_SKILL_CONTENT, 'utf-8')
    console.log('[officecli] SKILL.md installed to', skillPath)
  } catch (error) {
    console.warn('[officecli] SKILL.md install failed:', error instanceof Error ? error.message : error)
  }
}

// ============================================
// MCP 注册
// ============================================

/**
 * 注册 officecli MCP 服务器到 Agent
 */
async function registerMcp(agent: Agent): Promise<void> {
  try {
    const mcpManager = agent.context.mcpManager
    if (!mcpManager) {
      console.warn('[officecli] No MCP manager available on agent context')
      return
    }

    const cmd = getOfficeCliCommand()
    if (!cmd) {
      console.warn('[officecli] Cannot resolve binary for MCP registration')
      return
    }

    await mcpManager.addServer('officecli', {
      command: cmd.command,
      args: [...cmd.baseArgs, 'mcp'],
    })
    console.log('[officecli] MCP server registered')
  } catch (error) {
    console.warn('[officecli] MCP registration failed:', error instanceof Error ? error.message : error)
  }
}

// ============================================
// 主入口
// ============================================

/**
 * 完整的 OfficeCLI 集成设置
 *
 * 非阻塞——任何步骤失败只 log warning，不 throw。
 */
export async function setupOfficeCli(agent: Agent): Promise<void> {
  // 1. 检查二进制可用性
  let available = await isOfficeCliAvailable()

  // 本地二进制不可用时尝试全局安装（fallback）
  if (!available) {
    available = await installViaNpm()
  }

  if (!available) {
    console.warn(
      '[officecli] Binary not available. Preview will fall back to JS renderers.\n' +
      'Manual install: npm install -g @officecli/officecli --registry https://registry.npmmirror.com'
    )
    // 即使二进制不可用，也安装 skill（不依赖网络）
    await installSkill()
    return
  }

  console.log('[officecli] Binary available')

  // 2. 安装 skill + 注册 MCP（并行）
  await Promise.allSettled([
    installSkill(),
    registerMcp(agent),
  ])
}
