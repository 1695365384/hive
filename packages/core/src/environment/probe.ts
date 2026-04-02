/**
 * Environment Probe — Phase 1 (Synchronous)
 *
 * Collects basic system environment information at startup using only
 * the Node.js `os` module. Results are injected into Agent system prompts.
 *
 * Phase 2 (async PATH scan) is in scanner.ts.
 */

import os from 'node:os'
import type { EnvironmentContext } from './types.js'

/**
 * Generate human-readable OS display name.
 *
 * - darwin → "macOS {majorVersion}" (maps kernel version to macOS version)
 * - linux → "Linux"
 * - win32 → "Windows"
 */
function getOsDisplayName(platform: string, release: string): string {
  switch (platform) {
    case 'darwin': {
      const major = parseInt(release.split('.')[0], 10)
      const DARWIN_TO_MACOS: Record<number, string> = {
        24: '15',  // Sequoia
        23: '14',  // Sonoma
        22: '13',  // Ventura
        21: '12',  // Monterey
        20: '11',  // Big Sur
        19: '10.15', // Catalina
        18: '10.14', // Mojave
        17: '10.13', // High Sierra
        16: '10.12', // Sierra
      }
      const macosVersion = DARWIN_TO_MACOS[major]
      return macosVersion ? `macOS ${macosVersion}` : `macOS (Darwin ${major})`
    }
    case 'linux':
      return 'Linux'
    case 'win32':
      return 'Windows'
    default:
      return platform
  }
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
 * Detect CPU info from os.cpus()
 */
function detectCpu(): { model: string; cores: number } {
  const cpus = os.cpus()
  return {
    model: cpus[0]?.model ?? 'Unknown',
    cores: cpus.length,
  }
}

/**
 * Detect total memory in GB from os.totalmem()
 */
function detectMemory(): { totalGb: number } {
  return {
    totalGb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
  }
}

/**
 * Detect timezone from Intl API (no external commands).
 */
function detectTimezone(): { name: string; utcOffset: string } {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const offset = new Date().getTimezoneOffset()
  const sign = offset <= 0 ? '+' : '-'
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const minutes = String(Math.abs(offset) % 60).padStart(2, '0')
  return {
    name: tz,
    utcOffset: `UTC${sign}${hours}:${minutes}`,
  }
}

/**
 * Detect locale from environment variables.
 */
function detectLocale(): { system: string; language: string } {
  const system = process.env.LC_ALL ?? process.env.LC_CTYPE ?? process.env.LANG ?? process.env.LANGUAGE ?? ''
  const language = Intl.DateTimeFormat().resolvedOptions().locale
  return { system, language }
}

/**
 * Probe basic system environment (Phase 1, synchronous, < 1ms).
 *
 * Uses only the Node.js `os` module and Intl API. No external commands.
 * Results are injected into Agent system prompts.
 *
 * @param cwd - Working directory (defaults to process.cwd())
 */
export function probeEnvironment(cwd?: string): EnvironmentContext {
  const platform = os.platform()
  const release = os.release()
  const arch = os.arch()

  return {
    os: {
      platform,
      arch,
      version: release,
      displayName: getOsDisplayName(platform, release),
    },
    shell: detectShell(),
    node: {
      version: process.version,
    },
    cpu: detectCpu(),
    memory: detectMemory(),
    cwd: cwd ?? process.cwd(),
    timezone: detectTimezone(),
    locale: detectLocale(),
  }
}
