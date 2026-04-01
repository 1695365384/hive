/**
 * Environment Scanner — Phase 2 (Async)
 *
 * Scans all directories in PATH for executable files,
 * classifies them using the category dictionary, detects versions,
 * and stores results in SQLite for on-demand querying.
 */

import os from 'node:os'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { categorizeTool, type ToolCategory } from './tool-categories.js'

/** Maximum number of PATH directories to scan */
const MAX_PATH_DIRS = 50

/** Individual version detection timeout */
const VERSION_TIMEOUT_MS = 2_000

/** Max version string length */
const MAX_VERSION_LENGTH = 200

/** Windows executable extensions */
const WIN_EXE_EXTENSIONS = ['.exe', '.bat', '.cmd', '.ps1']

/** Max concurrent version detections */
const VERSION_CONCURRENCY = 10

/** Scanned tool entry */
export interface ScannedTool {
  name: string
  category: ToolCategory
  version: string | null
  path: string
}

/**
 * Parse PATH environment variable into directory list.
 */
function parsePathDirs(): string[] {
  const raw = process.env.PATH || process.env.Path || ''
  const sep = os.platform() === 'win32' ? ';' : ':'
  return raw.split(sep).map(d => d.trim()).filter(Boolean)
}

/**
 * Check if a file is executable on the current platform.
 */
function isExecutable(filePath: string): boolean {
  const platform = os.platform()

  if (platform === 'win32') {
    const ext = path.extname(filePath).toLowerCase()
    return WIN_EXE_EXTENSIONS.includes(ext)
  }

  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * List executable files in a directory (async).
 */
async function listExecutables(dir: string): Promise<string[]> {
  try {
    const stat = await fsp.stat(dir)
    if (!stat.isDirectory()) return []
  } catch {
    return []
  }

  try {
    const entries = await fsp.readdir(dir)
    const results: string[] = []
    for (const entry of entries) {
      const filePath = path.join(dir, entry)
      try {
        const fileStat = await fsp.stat(filePath)
        if (fileStat.isFile() && isExecutable(filePath)) {
          results.push(filePath)
        }
      } catch {
        // skip inaccessible files
      }
    }
    return results
  } catch {
    return []
  }
}

/**
 * Detect tool version by running `toolPath --version`.
 * Uses execFileSync (no shell interpretation) to prevent command injection.
 * Returns first line of output, truncated to MAX_VERSION_LENGTH.
 * Returns null on failure or timeout.
 */
function detectVersion(toolPath: string): string | null {
  try {
    const result = execFileSync(toolPath, ['--version'], {
      timeout: VERSION_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const firstLine = result.trim().split('\n')[0]?.trim() ?? ''
    if (!firstLine) return null
    return firstLine.length > MAX_VERSION_LENGTH
      ? firstLine.slice(0, MAX_VERSION_LENGTH) + '...'
      : firstLine
  } catch {
    return null
  }
}

/**
 * Run version detections with bounded concurrency.
 */
async function detectVersionsConcurrent(
  tools: Array<{ name: string; category: ToolCategory; path: string }>,
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>()
  const queue = tools.filter(t => t.category !== 'other')

  async function worker() {
    while (true) {
      const item = queue.pop()
      if (!item) break
      results.set(item.name, detectVersion(item.path))
    }
  }

  const workers = Array.from(
    { length: Math.min(VERSION_CONCURRENCY, queue.length) },
    () => worker(),
  )
  await Promise.all(workers)

  return results
}

/**
 * Scan all PATH directories for executables, classify and version-detect them.
 *
 * @returns Array of scanned tools
 */
export async function scanPath(): Promise<ScannedTool[]> {
  const dirs = parsePathDirs().slice(0, MAX_PATH_DIRS)
  const platform = os.platform()
  const seen = new Set<string>()
  const tools: ScannedTool[] = []

  // List executables from all dirs concurrently
  const dirResults = await Promise.all(dirs.map(dir => listExecutables(dir)))

  for (const executables of dirResults) {
    for (const filePath of executables) {
      const actualName = path.basename(filePath, path.extname(filePath))
      if (seen.has(actualName)) continue
      seen.add(actualName)

      const category = categorizeTool(actualName, platform)
      tools.push({ name: actualName, category, version: null, path: filePath })
    }
  }

  // Detect versions with bounded concurrency
  const versions = await detectVersionsConcurrent(tools)
  for (const tool of tools) {
    const v = versions.get(tool.name)
    if (v !== undefined) tool.version = v
  }

  return tools
}

/**
 * Create env_tools table and index in SQLite.
 */
function createTable(db: import('better-sqlite3').Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS env_tools (
      name       TEXT PRIMARY KEY,
      category   TEXT NOT NULL,
      version    TEXT,
      path       TEXT,
      scanned_at INTEGER NOT NULL
    )
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_env_tools_category
    ON env_tools(category)
  `)
}

/**
 * Write scanned tools to SQLite.
 */
function writeToDb(
  db: import('better-sqlite3').Database,
  tools: ScannedTool[],
): void {
  createTable(db)

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO env_tools (name, category, version, path, scanned_at)
    VALUES (@name, @category, @version, @path, @scanned_at)
  `)

  const scannedAt = Date.now()
  const insertMany = db.transaction((items: ScannedTool[]) => {
    for (const tool of items) {
      stmt.run({
        name: tool.name,
        category: tool.category,
        version: tool.version,
        path: tool.path,
        scanned_at: scannedAt,
      })
    }
  })

  insertMany(tools)
}

/**
 * Scan environment and store results in SQLite (Phase 2).
 *
 * This is an async operation that should be called at startup
 * without blocking Agent request handling.
 *
 * @param dbPath - Path to the SQLite database file
 */
export async function scanEnvironment(dbPath: string): Promise<void> {
  const Database = (await import('better-sqlite3')).default
  const db = new Database(dbPath)

  try {
    const tools = await scanPath()
    writeToDb(db, tools)
  } finally {
    db.close()
  }
}
