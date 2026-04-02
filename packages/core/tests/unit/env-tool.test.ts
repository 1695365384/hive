import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRawEnvTool, setEnvDbProvider } from '../../src/tools/built-in/env-tool.js'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ============================================
// Shared test helpers
// ============================================

const DDL = `
  CREATE TABLE IF NOT EXISTS env_tools (
    name TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    version TEXT,
    path TEXT,
    scanned_at INTEGER NOT NULL
  )
`;

const SEED_TOOLS = `
  INSERT INTO env_tools VALUES
    ('git', 'vcs', '2.39.0', '/usr/bin/git', 1700000000),
    ('node', 'runtime', 'v22.20.0', '/usr/local/bin/node', 1700000000),
    ('python3', 'runtime', '3.12.1', '/usr/bin/python3', 1700000000),
    ('pnpm', 'pkgManager', '9.0.0', '/usr/local/bin/pnpm', 1700000000),
    ('docker', 'container', '27.5.1', '/usr/local/bin/docker', 1700000000),
    ('screencapture', 'system', NULL, '/usr/bin/screencapture', 1700000000),
    ('make', 'buildTool', 'GNU Make 3.81', '/usr/bin/make', 1700000000),
    ('random-tool', 'other', NULL, '/usr/local/bin/random-tool', 1700000000);
`;

const SEED_NATIVE_APPS = `
  INSERT INTO env_tools VALUES
    ('Notes', 'native-app', NULL, 'osascript -e ''tell application "Notes"''', 1700000000),
    ('Reminders', 'native-app', NULL, 'osascript -e ''tell application "Reminders"''', 1700000000),
    ('Calendar', 'native-app', NULL, 'osascript -e ''tell application "Calendar"''', 1700000000),
    ('Safari', 'native-app', NULL, 'osascript -e ''tell application "Safari"''', 1700000000);
`;

async function seedDb(dbPath: string, extraSql?: string): Promise<void> {
  const Database = (await import('better-sqlite3')).default
  const db = new Database(dbPath)
  db.exec(DDL)
  db.exec(SEED_TOOLS)
  if (extraSql) db.exec(extraSql)
  db.close()
}

async function createEmptyTable(dbPath: string): Promise<void> {
  const Database = (await import('better-sqlite3')).default
  const db = new Database(dbPath)
  db.exec(DDL)
  db.close()
}

type ToolRef = { tool: ReturnType<typeof createRawEnvTool> | null; dbPath: string; testDir: string }

function setupTestEnv(suffix: string): ToolRef {
  const ref: ToolRef = { tool: null, dbPath: '', testDir: '' }

  beforeEach(async () => {
    const testDir = join(tmpdir(), `hive-test-env-${suffix}`)
    ref.testDir = testDir
    ref.dbPath = join(testDir, 'test.db')
    mkdirSync(testDir, { recursive: true })
    ref.tool = createRawEnvTool()
    setEnvDbProvider(() => ref.dbPath)
  })

  afterEach(() => {
    rmSync(ref.testDir, { recursive: true, force: true })
    setEnvDbProvider(() => undefined)
  })

  return ref
}

function getTool(ref: ToolRef): ReturnType<typeof createRawEnvTool> {
  if (!ref.tool) throw new Error('tool not initialized — ensure beforeEach ran')
  return ref.tool
}

// ============================================
// Tests
// ============================================

describe('env tool', () => {
  const env = setupTestEnv('basic')

  it('queries by keyword', async () => {
    await seedDb(env.dbPath)
    const result = await getTool(env).execute({ query: 'python' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('python3')
    expect(result.data).toContain('runtime')
  })

  it('queries by category', async () => {
    await seedDb(env.dbPath)
    const result = await getTool(env).execute({ category: 'container' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('docker')
  })

  it('combined query (keyword + category)', async () => {
    await seedDb(env.dbPath)
    const result = await getTool(env).execute({ query: 'py', category: 'runtime' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('python3')
  })

  it('returns empty result message for no matches', async () => {
    await seedDb(env.dbPath)
    const result = await getTool(env).execute({ query: 'nonexistent_tool_xyz' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('No tools found matching')
  })

  it('returns "not ready" when db has no data', async () => {
    await createEmptyTable(env.dbPath)
    const result = await getTool(env).execute({ query: 'git' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('Environment probing not yet complete')
  })

  it('returns error when db path not configured', async () => {
    setEnvDbProvider(() => undefined)
    const result = await getTool(env).execute({ query: 'git' })
    expect(result.ok).toBe(false)
  })

  it('groups results by category', async () => {
    await seedDb(env.dbPath)
    const result = await getTool(env).execute({ query: '' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('runtime')
    expect(result.data).toContain('vcs')
  })
})

describe('env tool — overview mode (no parameters)', () => {
  const env = setupTestEnv('overview')

  it('returns category summary when no parameters provided', async () => {
    await seedDb(env.dbPath, SEED_NATIVE_APPS)
    const result = await getTool(env).execute({})
    expect(result.ok).toBe(true)
    expect(result.data).toContain('runtime')
    expect(result.data).toContain('native-app')
    expect(result.data).toContain('tools)')
  })

  it('includes usage hints in overview', async () => {
    await seedDb(env.dbPath, SEED_NATIVE_APPS)
    const result = await getTool(env).execute({})
    expect(result.ok).toBe(true)
    expect(result.data).toContain('env(category=')
    expect(result.data).toContain('env(query=')
  })

  it('returns "not ready" for overview when db is empty', async () => {
    await createEmptyTable(env.dbPath)
    const result = await getTool(env).execute({})
    expect(result.ok).toBe(true)
    expect(result.data).toContain('Environment probing not yet complete')
  })

  it('orders categories by count descending', async () => {
    await seedDb(env.dbPath, SEED_NATIVE_APPS)
    const result = await getTool(env).execute({})
    expect(result.ok).toBe(true)
    const lines = result.data!.split('\n')
    const runtimeIdx = lines.findIndex(l => l.includes('runtime'))
    const otherIdx = lines.findIndex(l => l.includes('vcs'))
    expect(runtimeIdx).toBeGreaterThanOrEqual(0)
    expect(otherIdx).toBeGreaterThanOrEqual(0)
  })
})

describe('env tool — native-app category', () => {
  const env = setupTestEnv('native')

  const SEED_VCS = `
    INSERT OR IGNORE INTO env_tools VALUES
      ('git', 'vcs', '2.39.0', '/usr/bin/git', 1700000000)
  `;

  it('queries by native-app category', async () => {
    await seedDb(env.dbPath, SEED_NATIVE_APPS + '\n' + SEED_VCS)
    const result = await getTool(env).execute({ category: 'native-app' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('Notes')
    expect(result.data).toContain('Reminders')
    expect(result.data).toContain('Calendar')
    expect(result.data).toContain('native-app')
  })

  it('keyword search matches native app name', async () => {
    await seedDb(env.dbPath, SEED_NATIVE_APPS)
    const result = await getTool(env).execute({ query: 'notes' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('Notes')
  })

  it('native-app output shows access command format', async () => {
    await seedDb(env.dbPath, SEED_NATIVE_APPS)
    const result = await getTool(env).execute({ category: 'native-app' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('access:')
    expect(result.data).toContain('osascript')
  })

  it('native-app output includes platform interaction hint', async () => {
    await seedDb(env.dbPath, SEED_NATIVE_APPS)
    const result = await getTool(env).execute({ category: 'native-app' })
    expect(result.ok).toBe(true)
    if (process.platform === 'darwin') {
      expect(result.data).toContain('AppleScript')
      expect(result.data).toContain('tell application')
    }
  })

  it('native-app output warns against direct database access', async () => {
    await seedDb(env.dbPath, SEED_NATIVE_APPS)
    const result = await getTool(env).execute({ category: 'native-app' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('Do NOT access')
  })

  it('non-native-app entries use standard path format', async () => {
    await seedDb(env.dbPath, SEED_VCS)
    const result = await getTool(env).execute({ category: 'vcs' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('git')
    expect(result.data).not.toContain('access:')
  })
})
