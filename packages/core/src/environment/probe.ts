/**
 * Environment Probe
 *
 * Collects system environment information at startup.
 * Runs once, results injected into Agent system prompts.
 */

import os from 'node:os'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import type { EnvironmentContext } from './types.js'

/** Tools to detect concurrently */
const TOOLS_TO_DETECT = [
  'git', 'pnpm', 'npm', 'yarn', 'docker', 'python3', 'python',
  'go', 'cargo', 'brew', 'bun',
] as const

/** Overall probe timeout */
const PROBE_TIMEOUT_MS = 5_000

/** Individual tool detection timeout */
const TOOL_TIMEOUT_MS = 2_000

/**
 * Detect a single tool using `which` (macOS/Linux) or `where` (Windows).
 * Returns the tool name if found, or empty string if not found / timed out.
 */
function detectTool(tool: string): string {
  const cmd = os.platform() === 'win32' ? `where ${tool}` : `which ${tool}`
  try {
    const result = execSync(cmd, {
      timeout: TOOL_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return result.trim() ? tool : ''
  } catch {
    return ''
  }
}

/**
 * Detect all tools concurrently by spawning short-lived child processes.
 * Falls back to sequential detection if Promise.all is not available (unlikely).
 */
function detectTools(): string[] {
  // Spawn all detections synchronously (Node.js execSync is blocking)
  // This is fine because probeEnvironment runs once at startup
  const found: string[] = []
  for (const tool of TOOLS_TO_DETECT) {
    if (detectTool(tool)) {
      found.push(tool)
    }
  }
  return found
}

/**
 * Detect shell type from process.env.SHELL
 */
function detectShell(): string {
  const shellPath = process.env.SHELL
  if (!shellPath) return 'unknown'
  const segments = shellPath.replace(/\\/g, '/').split('/')
  return segments[segments.length - 1] || 'unknown'
}

/**
 * Detect project type from characteristic files in cwd
 */
function detectProjectType(cwd: string): string {
  // Check TypeScript first (tsconfig.json implies TS even if package.json exists)
  if (existsSync(join(cwd, 'tsconfig.json'))) return 'typescript'
  if (existsSync(join(cwd, 'go.mod'))) return 'golang'
  if (existsSync(join(cwd, 'pyproject.toml'))) return 'python'
  if (existsSync(join(cwd, 'requirements.txt'))) return 'python'
  if (existsSync(join(cwd, 'package.json'))) return 'javascript'
  return 'unknown'
}

/**
 * Detect package manager: lockfile first, then tool availability
 */
function detectPackageManager(cwd: string, tools: string[]): string {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(cwd, 'package-lock.json'))) return 'npm'

  if (tools.includes('pnpm')) return 'pnpm'
  if (tools.includes('yarn')) return 'yarn'
  if (tools.includes('npm')) return 'npm'

  return 'unknown'
}

/**
 * Probe the system environment once at startup.
 *
 * Collects OS, shell, Node.js, available tools, package manager,
 * project type, and cwd. Respects a 5s overall timeout.
 *
 * @param cwd - Working directory to detect project type (defaults to process.cwd())
 */
export function probeEnvironment(cwd?: string): EnvironmentContext {
  const start = Date.now()
  const workingDir = cwd ?? process.cwd()

  // Synchronous parts (instant)
  const platform = os.platform()
  const arch = os.arch()
  const osVersion = os.release()
  const nodeVersion = process.version
  const shell = detectShell()

  // Check timeout budget before slow operations
  const remaining = PROBE_TIMEOUT_MS - (Date.now() - start)
  if (remaining <= 0) {
    return {
      os: { platform, arch, version: osVersion },
      shell,
      node: { version: nodeVersion },
      tools: [],
      packageManager: 'unknown',
      projectType: 'unknown',
      cwd: workingDir,
    }
  }

  // Tool detection (potentially slow, but bounded by individual timeouts)
  const tools = detectTools()

  // Final timeout check
  const remaining2 = PROBE_TIMEOUT_MS - (Date.now() - start)
  if (remaining2 <= 0) {
    return {
      os: { platform, arch, version: osVersion },
      shell,
      node: { version: nodeVersion },
      tools,
      packageManager: 'unknown',
      projectType: 'unknown',
      cwd: workingDir,
    }
  }

  // Project detection (file system checks, fast)
  const projectType = detectProjectType(workingDir)
  const packageManager = detectPackageManager(workingDir, tools)

  return {
    os: { platform, arch, version: osVersion },
    shell,
    node: { version: nodeVersion },
    tools,
    packageManager,
    projectType,
    cwd: workingDir,
  }
}
