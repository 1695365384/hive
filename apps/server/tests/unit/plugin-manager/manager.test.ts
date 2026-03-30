import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
}))

vi.mock('../../../src/config.js', () => ({
  HIVE_HOME: '/tmp/test-hive',
}))

vi.mock('../../../src/plugin-manager/registry.js', () => ({
  loadRegistry: vi.fn(),
  removePlugin: vi.fn(),
  getPlugin: vi.fn(),
}))

import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { listPlugins, removePlugin, showPluginInfo } from '../../../src/plugin-manager/manager.js'
import { loadRegistry, removePlugin as removeFromRegistry, getPlugin } from '../../../src/plugin-manager/registry.js'

const mockedFs = vi.mocked({ existsSync, readFileSync, writeFileSync, rmSync })
const mockedRegistry = vi.mocked({ loadRegistry, removePlugin: removeFromRegistry, getPlugin })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listPlugins', () => {
  it('shows message when no plugins installed', () => {
    mockedRegistry.loadRegistry.mockReturnValue({})
    expect(listPlugins()).toContain('No plugins installed')
  })

  it('lists installed plugins', () => {
    mockedRegistry.loadRegistry.mockReturnValue({
      feishu: { source: 'npm:@bundy-lmw/hive-plugin-feishu@1.0.0', installedAt: '2026-01-15T00:00:00.000Z', resolvedVersion: '1.0.0' },
      wechat: { source: 'git:https://github.com/user/plugin', installedAt: '2026-03-01T00:00:00.000Z', resolvedVersion: '0.5.0' },
    })
    mockedFs.existsSync.mockReturnValue(true)

    const output = listPlugins()
    expect(output).toContain('feishu')
    expect(output).toContain('v1.0.0')
    expect(output).toContain('npm')
    expect(output).toContain('wechat')
    expect(output).toContain('git')
    expect(output).toContain('2 plugin(s)')
  })

  it('marks missing plugins', () => {
    mockedRegistry.loadRegistry.mockReturnValue({
      feishu: { source: 'npm:@bundy-lmw/hive-plugin-feishu@1.0.0', installedAt: '2026-01-01', resolvedVersion: '1.0.0' },
    })
    mockedFs.existsSync.mockReturnValue(false)

    expect(listPlugins()).toContain('(missing)')
  })
})

describe('removePlugin', () => {
  it('removes plugin successfully', () => {
    mockedRegistry.getPlugin.mockReturnValue({ source: 'npm:@bundy-lmw/hive-plugin-feishu', installedAt: '2026-01-01', resolvedVersion: '1.0.0' })
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({ plugins: { feishu: {} } }))

    const result = removePlugin('feishu')

    expect(result.success).toBe(true)
    expect(mockedRegistry.removePlugin).toHaveBeenCalledWith('feishu')
    expect(rmSync).toHaveBeenCalledWith(expect.stringContaining('feishu'), { recursive: true, force: true })
  })

  it('returns error when plugin not installed', () => {
    mockedRegistry.getPlugin.mockReturnValue(undefined)

    const result = removePlugin('nonexistent')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Plugin not installed')
  })
})

describe('showPluginInfo', () => {
  it('shows plugin details', () => {
    mockedRegistry.getPlugin.mockReturnValue({
      source: 'npm:@bundy-lmw/hive-plugin-feishu@1.0.0',
      installedAt: '2026-01-15T00:00:00.000Z',
      resolvedVersion: '1.0.0',
    })
    mockedFs.existsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('package.json')) return true
      if (typeof path === 'string' && path.includes('hive.config.json')) return true
      return false
    })
    mockedFs.readFileSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('plugins') && path.includes('package.json')) {
        return JSON.stringify({ description: '飞书消息收发', homepage: 'https://github.com/hive/plugin-feishu' })
      }
      if (typeof path === 'string' && path.includes('hive.config.json')) {
        return JSON.stringify({ plugins: { feishu: { appId: 'xxx' } } })
      }
      return '{}'
    })

    const result = showPluginInfo('feishu')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.info.name).toBe('feishu')
      expect(result.info.version).toBe('1.0.0')
    }
  })

  it('returns error for non-existent plugin', () => {
    mockedRegistry.getPlugin.mockReturnValue(undefined)

    const result = showPluginInfo('nonexistent')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Plugin not installed')
    }
  })
})
