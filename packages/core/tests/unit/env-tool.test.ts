import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRawEnvTool, setEnvDbProvider } from '../../src/tools/built-in/env-tool.js'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('env tool', () => {
  const testDir = join(tmpdir(), 'hive-test-env')
  const dbPath = join(testDir, 'test.db')
  let tool: ReturnType<typeof createRawEnvTool>

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    tool = createRawEnvTool()
    setEnvDbProvider(() => dbPath)
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    setEnvDbProvider(() => undefined)
  })

  async function seedDb(): Promise<void> {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(dbPath)
    db.exec(`
      CREATE TABLE IF NOT EXISTS env_tools (
        name TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        version TEXT,
        path TEXT,
        scanned_at INTEGER NOT NULL
      )
    `)
    db.exec(`
      INSERT INTO env_tools VALUES
        ('git', 'vcs', '2.39.0', '/usr/bin/git', 1700000000),
        ('node', 'runtime', 'v22.20.0', '/usr/local/bin/node', 1700000000),
        ('python3', 'runtime', '3.12.1', '/usr/bin/python3', 1700000000),
        ('pnpm', 'pkgManager', '9.0.0', '/usr/local/bin/pnpm', 1700000000),
        ('docker', 'container', '27.5.1', '/usr/local/bin/docker', 1700000000),
        ('screencapture', 'system', NULL, '/usr/bin/screencapture', 1700000000),
        ('make', 'buildTool', 'GNU Make 3.81', '/usr/bin/make', 1700000000),
        ('random-tool', 'other', NULL, '/usr/local/bin/random-tool', 1700000000)
    `)
    db.close()
  }

  it('queries by keyword', async () => {
    await seedDb()
    const result = await tool.execute({ query: 'python' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('python3')
    expect(result.data).toContain('runtime')
  })

  it('queries by category', async () => {
    await seedDb()
    const result = await tool.execute({ category: 'container' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('docker')
  })

  it('combined query (keyword + category)', async () => {
    await seedDb()
    const result = await tool.execute({ query: 'py', category: 'runtime' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('python3')
  })

  it('returns empty result message for no matches', async () => {
    await seedDb()
    const result = await tool.execute({ query: 'nonexistent_tool_xyz' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('未找到')
  })

  it('returns results when no query/category params (matches all)', async () => {
    await seedDb()
    const result = await tool.execute({})
    // Zod allows both params to be optional, so empty query returns all
    expect(result.ok).toBe(true)
    expect(result.data).toContain('runtime')
  })

  it('returns "not ready" when db has no data', async () => {
    // Create empty db (no env_tools table)
    const Database = (await import('better-sqlite3')).default
    const db = new Database(dbPath)
    db.exec('CREATE TABLE env_tools (name TEXT PRIMARY KEY, category TEXT NOT NULL, version TEXT, path TEXT, scanned_at INTEGER NOT NULL)')
    db.close()

    const result = await tool.execute({ query: 'git' })
    expect(result.ok).toBe(true)
    expect(result.data).toContain('环境探测尚未完成')
  })

  it('returns error when db path not configured', async () => {
    setEnvDbProvider(() => undefined)
    const result = await tool.execute({ query: 'git' })
    expect(result.ok).toBe(false)
  })

  it('groups results by category', async () => {
    await seedDb()
    const result = await tool.execute({ query: '' })
    expect(result.ok).toBe(true)
    // Should have multiple category headers
    expect(result.data).toContain('runtime')
    expect(result.data).toContain('vcs')
  })
})
