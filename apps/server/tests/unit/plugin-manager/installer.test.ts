import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  cpSync: vi.fn(),
  rmSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

vi.mock('../../../src/config.js', () => ({
  HIVE_HOME: '/tmp/test-hive',
}))

vi.mock('../../../src/plugin-manager/registry.js', () => ({
  hasPlugin: vi.fn().mockReturnValue(false),
  addPlugin: vi.fn(),
}))

import { existsSync, readFileSync, writeFileSync, cpSync, rmSync, mkdirSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolveSource } from '../../../src/plugin-manager/installer.js'
import { hasPlugin } from '../../../src/plugin-manager/registry.js'

const mockedFs = vi.mocked({ existsSync, readFileSync, writeFileSync, cpSync, rmSync, mkdirSync, readdirSync })

/**
 * 创建一个模拟的 ChildProcess，调用 on(event, cb) 后立即触发 cb
 */
function createMockChildProcess(exitCode = 0): { on: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn> } {
  const listeners = new Map<string, Function[]>()
  return {
    on: vi.fn((event: string, cb: Function) => {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event)!.push(cb)
      // 异步触发 close 事件
      if (event === 'close') {
        setTimeout(() => cb(exitCode), 0)
      }
    }),
    kill: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveSource', () => {
  it('identifies npm scope packages', () => {
    const src = resolveSource('@bundy-lmw/hive-plugin-feishu')
    expect(src.type).toBe('npm')
    expect(src.targetName).toBe('feishu')
    expect(src.resolved).toBe('@bundy-lmw/hive-plugin-feishu')
  })

  it('identifies npm packages without scope', () => {
    const src = resolveSource('some-plugin')
    expect(src.type).toBe('npm')
    expect(src.targetName).toBe('some-plugin')
  })

  it('identifies https git URLs', () => {
    const src = resolveSource('https://github.com/user/hive-plugin-feishu.git')
    expect(src.type).toBe('git')
    expect(src.targetName).toBe('hive-plugin-feishu')
  })

  it('identifies git@ SSH URLs', () => {
    const src = resolveSource('git@github.com:user/plugin.git')
    expect(src.type).toBe('git')
    expect(src.targetName).toBe('plugin')
  })

  it('identifies local relative paths', () => {
    const src = resolveSource('./my-plugin')
    expect(src.type).toBe('local')
    expect(src.resolved).toContain('my-plugin')
  })

  it('identifies local absolute paths', () => {
    const src = resolveSource('/home/user/plugin')
    expect(src.type).toBe('local')
    expect(src.resolved).toBe('/home/user/plugin')
  })
})

describe('installPlugin (via registry mock)', () => {
  it('rejects already installed plugins', async () => {
    vi.mocked(hasPlugin).mockReturnValue(true)

    const { installPlugin } = await import('../../../src/plugin-manager/installer.js')
    const result = await installPlugin('@bundy-lmw/hive-plugin-feishu')

    expect(result.success).toBe(false)
    expect(result.error).toContain('already installed')
  })

  it('installs npm package successfully', async () => {
    vi.mocked(hasPlugin).mockReturnValue(false)
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.readFileSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('package.json')) {
        return JSON.stringify({ name: '@bundy-lmw/hive-plugin-feishu', version: '1.0.0', hive: { plugin: true } })
      }
      return JSON.stringify({ plugins: {} })
    })
    vi.mocked(spawn).mockReturnValue(createMockChildProcess(0) as any)

    const { installPlugin } = await import('../../../src/plugin-manager/installer.js')
    const result = await installPlugin('@bundy-lmw/hive-plugin-feishu')

    expect(result.success).toBe(true)
    expect(result.name).toBe('feishu')
    expect(result.version).toBe('1.0.0')
  })

  it('rolls back on npm install failure', async () => {
    vi.mocked(hasPlugin).mockReturnValue(false)
    mockedFs.existsSync.mockReturnValue(true)
    vi.mocked(spawn).mockReturnValue(createMockChildProcess(1) as any)

    const { installPlugin } = await import('../../../src/plugin-manager/installer.js')
    const result = await installPlugin('@bundy-lmw/hive-plugin-feishu')

    expect(result.success).toBe(false)
    expect(result.error).toContain('failed')
    expect(rmSync).toHaveBeenCalledWith(expect.stringContaining('feishu'), { recursive: true, force: true })
  })

  it('fails when package.json missing hive.plugin field', async () => {
    vi.mocked(hasPlugin).mockReturnValue(false)
    mockedFs.existsSync.mockImplementation((path: string) => true)
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({ name: 'some-pkg', version: '1.0.0' }))
    mockedFs.readdirSync.mockReturnValue([])
    vi.mocked(spawn).mockReturnValue(createMockChildProcess(0) as any)

    const { installPlugin } = await import('../../../src/plugin-manager/installer.js')
    const result = await installPlugin('@bundy-lmw/hive-plugin-feishu')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Not a valid Hive plugin')
  })

  it('fails for missing local path', async () => {
    vi.mocked(hasPlugin).mockReturnValue(false)
    mockedFs.existsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('hive.config.json')) return true
      return false
    })
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({ plugins: {} }))

    const { installPlugin } = await import('../../../src/plugin-manager/installer.js')
    const result = await installPlugin('./nonexistent')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Path not found')
  })
})
