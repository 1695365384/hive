/**
 * Native App Scanner — Dynamic Discovery
 *
 * Discovers installed native applications from the filesystem at runtime.
 * No hardcoded app lists — apps are found by scanning platform-specific
 * directories (e.g., /Applications/*.app on macOS).
 *
 * Access commands use platform-level templates (one rule per platform),
 * not per-app hardcoding.
 */

import os from 'node:os'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { ScannedTool } from './scanner.js'

/** Application directories to scan on macOS */
const MACOS_APP_DIRS = ['/Applications', '/System/Applications']

/** Maximum number of native apps to return (prevents DB bloat) */
const MAX_APPS = 200

/**
 * Build platform-level access command for a native app.
 *
 * Uses one template per platform — not per-app hardcoding.
 * The template is applied to every discovered app name.
 */
function buildAccessCommand(appName: string, platform: string): string {
  switch (platform) {
    case 'darwin':
      return `osascript -e 'tell application "${appName}"'`
    case 'win32':
      return `start "" "${appName}"`
    case 'linux':
      return `gio launch "${appName.toLowerCase()}.desktop" 2>/dev/null || ${appName.toLowerCase()}`
    default:
      return appName
  }
}

/**
 * Discover installed macOS applications by scanning .app bundles.
 *
 * Scans /Applications, /System/Applications, and ~/Applications.
 * Returns app names (without .app suffix).
 */
async function discoverDarwinApps(): Promise<string[]> {
  const home = os.homedir()
  const dirs = [...MACOS_APP_DIRS, path.join(home, 'Applications')]
  const apps = new Set<string>()

  await Promise.all(dirs.map(async (dir) => {
    try {
      const entries = await fsp.readdir(dir)
      for (const entry of entries) {
        if (entry.endsWith('.app')) {
          apps.add(entry.replace(/\.app$/, ''))
        }
      }
    } catch {
      // Directory not accessible — skip silently
    }
  }))

  return Array.from(apps)
}

/**
 * Discover installed Windows applications.
 *
 * Enumerates shortcuts from common Start Menu directories.
 */
async function discoverWin32Apps(): Promise<string[]> {
  const startMenuDirs = [
    path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
    path.join(os.homedir(), 'AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs'),
  ]
  const apps = new Set<string>()

  await Promise.all(startMenuDirs.map(async (dir) => {
    try {
      const entries = await fsp.readdir(dir, { recursive: true })
      for (const entry of entries) {
        if (typeof entry === 'string' && entry.endsWith('.lnk')) {
          const name = path.basename(entry, '.lnk')
          if (name && !name.startsWith('.')) {
            apps.add(name)
          }
        }
      }
    } catch {
      // Directory not accessible — skip silently
    }
  }))

  return Array.from(apps)
}

/**
 * Discover installed Linux applications from XDG .desktop files.
 *
 * Parses Name= field from .desktop files in standard XDG directories.
 */
async function discoverLinuxApps(): Promise<string[]> {
  const dataDirs = [
    '/usr/share/applications',
    path.join(os.homedir(), '.local/share/applications'),
    '/var/lib/flatpak/exports/share/applications',
    path.join(os.homedir(), '.local/share/flatpak/exports/share/applications'),
  ]
  const apps = new Set<string>()

  await Promise.all(dataDirs.map(async (dir) => {
    try {
      const entries = await fsp.readdir(dir)
      await Promise.all(entries.map(async (entry) => {
        if (!entry.endsWith('.desktop')) return

        try {
          const content = await fsp.readFile(path.join(dir, entry), 'utf-8')
          const match = content.match(/^Name=(.+)$/m)
          if (match?.[1]) {
            apps.add(match[1].trim())
          }
        } catch {
          // File not readable — skip
        }
      }))
    } catch {
      // Directory not accessible — skip silently
    }
  }))

  return Array.from(apps)
}

/**
 * Scan native apps for the current platform using dynamic discovery.
 *
 * Discovers apps from filesystem (no hardcoded lists) and returns
 * them as ScannedTool entries with platform-level access commands.
 *
 * @param platform - Current platform (defaults to os.platform())
 * @returns Array of discovered native apps (limited to MAX_APPS)
 */
export async function scanNativeApps(platform?: string): Promise<ScannedTool[]> {
  const p = platform ?? os.platform()

  let appNames: string[]
  switch (p) {
    case 'darwin':
      appNames = await discoverDarwinApps()
      break
    case 'win32':
      appNames = await discoverWin32Apps()
      break
    case 'linux':
      appNames = await discoverLinuxApps()
      break
    default:
      return []
  }

  return appNames.slice(0, MAX_APPS).map(name => ({
    name,
    category: 'native-app' as const,
    version: null,
    path: buildAccessCommand(name, p),
  }))
}
