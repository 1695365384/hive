/**
 * Dashi PPT 内置技能同步
 *
 * 源（唯一）：仓库 `.hive/skills/dashi-ppt`
 * 运行时权威：`$HIVE_HOME/skills/dashi-ppt`
 *
 * server 启动时把仓库内置 skill 同步到 HIVE_HOME，避免按 cwd 复制多份。
 * 非阻塞：失败只 log warning。
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Agent } from '@bundy-lmw/hive-core'
import { HIVE_HOME } from './config.js'

const SKILL_NAME = 'dashi-ppt'
const META_FILE = '.hive-builtin.json'

type BuiltinMeta = {
  name: string
  version: string
  source: string
}

function readMeta(dir: string): BuiltinMeta | null {
  const metaPath = join(dir, META_FILE)
  if (existsSync(metaPath)) {
    try {
      return JSON.parse(readFileSync(metaPath, 'utf-8')) as BuiltinMeta
    } catch {
      // fall through to SKILL.md
    }
  }
  const skillPath = join(dir, 'SKILL.md')
  if (!existsSync(skillPath)) return null
  try {
    const skill = readFileSync(skillPath, 'utf-8')
    const match = skill.match(/当前版本:\s*`([^`]+)`/)
    if (!match?.[1]) return null
    return { name: SKILL_NAME, version: match[1], source: 'repo-builtin' }
  } catch {
    return null
  }
}

/**
 * 解析仓库内置 skill 目录（不依赖 process.cwd）
 */
export function resolveBundledDashiPptDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    // apps/server/src → repo root
    resolve(here, '../../../.hive/skills', SKILL_NAME),
    // cwd 是 repo root
    resolve(process.cwd(), '.hive/skills', SKILL_NAME),
    // cwd 是 apps/server
    resolve(process.cwd(), '../../.hive/skills', SKILL_NAME),
  ]

  for (const dir of candidates) {
    if (existsSync(join(dir, 'SKILL.md'))) {
      return dir
    }
  }
  return null
}

export function getRuntimeDashiPptDir(): string {
  return join(HIVE_HOME, 'skills', SKILL_NAME)
}

function needsSync(sourceDir: string, targetDir: string): boolean {
  if (!existsSync(join(targetDir, 'SKILL.md'))) return true
  const srcMeta = readMeta(sourceDir)
  const dstMeta = readMeta(targetDir)
  if (!srcMeta?.version) return false
  if (!dstMeta?.version) return true
  return srcMeta.version !== dstMeta.version
}

function syncSkill(sourceDir: string, targetDir: string): void {
  mkdirSync(dirname(targetDir), { recursive: true })
  const tmpDir = `${targetDir}.tmp-${process.pid}`
  rmSync(tmpDir, { recursive: true, force: true })

  cpSync(sourceDir, tmpDir, {
    recursive: true,
    filter: (src) => {
      const base = src.split(/[\\/]/).pop() || ''
      if (base === 'node_modules' || base === '.DS_Store') return false
      return true
    },
  })

  // 保留已有 project/node_modules，避免每次启动重装依赖
  const existingModules = join(targetDir, 'project', 'node_modules')
  const tmpModules = join(tmpDir, 'project', 'node_modules')
  if (existsSync(existingModules) && !existsSync(tmpModules)) {
    cpSync(existingModules, tmpModules, { recursive: true })
  }
  const existingNpmrc = join(targetDir, 'project', '.npmrc')
  if (existsSync(existingNpmrc)) {
    mkdirSync(join(tmpDir, 'project'), { recursive: true })
    cpSync(existingNpmrc, join(tmpDir, 'project', '.npmrc'))
  }

  rmSync(targetDir, { recursive: true, force: true })
  cpSync(tmpDir, targetDir, { recursive: true })
  rmSync(tmpDir, { recursive: true, force: true })

  // 确保 meta 落盘（兼容旧源无 meta）
  if (!existsSync(join(targetDir, META_FILE))) {
    writeFileSync(
      join(targetDir, META_FILE),
      JSON.stringify(
        {
          name: SKILL_NAME,
          version: 'unknown',
          source: 'repo-builtin',
        } satisfies BuiltinMeta,
        null,
        2,
      ) + '\n',
    )
  }
}

/**
 * 确保内置 dashi-ppt 已同步到 $HIVE_HOME/skills，并热重载技能表。
 */
export async function setupDashiPpt(agent?: Agent): Promise<void> {
  const sourceDir = resolveBundledDashiPptDir()
  if (!sourceDir) {
    console.warn(
      '[dashi-ppt] Bundled skill not found under repo .hive/skills/dashi-ppt. Skip sync.',
    )
    return
  }

  const targetDir = getRuntimeDashiPptDir()
  try {
    if (needsSync(sourceDir, targetDir)) {
      console.log(`[dashi-ppt] Syncing builtin skill → ${targetDir}`)
      syncSkill(sourceDir, targetDir)
      console.log('[dashi-ppt] Builtin skill ready')
    } else {
      console.log(`[dashi-ppt] Runtime skill up to date: ${targetDir}`)
    }

    agent?.reloadSkills?.()
  } catch (error) {
    console.warn(
      '[dashi-ppt] Setup failed:',
      error instanceof Error ? error.message : error,
    )
  }
}
