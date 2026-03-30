import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}))

vi.mock('../../../src/config.js', () => ({
  HIVE_HOME: '/tmp/test-hive',
}))

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import {
  loadRegistry,
  saveRegistry,
  addPlugin,
  removePlugin,
  getPlugin,
  hasPlugin,
} from '../../../src/plugin-manager/registry.js'

const mockedFs = vi.mocked({ existsSync, readFileSync, writeFileSync, mkdirSync })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadRegistry', () => {
  it('returns empty object when file does not exist', () => {
    mockedFs.existsSync.mockReturnValue(false)
    expect(loadRegistry()).toEqual({})
  })

  it('returns parsed JSON when file exists', () => {
    const data = { feishu: { source: 'npm:@bundy-lmw/hive-plugin-feishu@1.0.0', installedAt: '2026-01-01T00:00:00.000Z', resolvedVersion: '1.0.0' } }
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(data))

    expect(loadRegistry()).toEqual(data)
  })

  it('returns empty object when file is corrupted', () => {
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.readFileSync.mockReturnValue('not json{{{')

    expect(loadRegistry()).toEqual({})
  })
})

describe('saveRegistry', () => {
  it('creates directory if not exists and writes JSON', () => {
    mockedFs.existsSync.mockReturnValue(false)

    saveRegistry({ feishu: { source: 'npm:@bundy-lmw/hive-plugin-feishu', installedAt: '2026-01-01', resolvedVersion: '1.0.0' } })

    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('plugins'), { recursive: true })
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.registry.json'),
      expect.stringContaining('"feishu"'),
      'utf-8',
    )
  })
})

describe('addPlugin', () => {
  it('adds entry to registry and saves', () => {
    mockedFs.existsSync.mockReturnValue(false)
    mockedFs.readFileSync.mockReturnValue('{}')

    addPlugin('feishu', { source: 'npm:@bundy-lmw/hive-plugin-feishu@1.0.0', installedAt: '2026-01-01T00:00:00.000Z', resolvedVersion: '1.0.0' })

    expect(mockedFs.writeFileSync).toHaveBeenCalled()
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(written.feishu).toBeDefined()
    expect(written.feishu.source).toBe('npm:@bundy-lmw/hive-plugin-feishu@1.0.0')
  })
})

describe('removePlugin', () => {
  it('removes entry and returns true', () => {
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({
      feishu: { source: 'npm:@bundy-lmw/hive-plugin-feishu', installedAt: '2026-01-01', resolvedVersion: '1.0.0' },
    }))

    expect(removePlugin('feishu')).toBe(true)
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(written.feishu).toBeUndefined()
  })

  it('returns false when plugin not found', () => {
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.readFileSync.mockReturnValue('{}')

    expect(removePlugin('nonexistent')).toBe(false)
  })
})

describe('getPlugin', () => {
  it('returns entry when plugin exists', () => {
    const entry = { source: 'npm:@bundy-lmw/hive-plugin-feishu', installedAt: '2026-01-01', resolvedVersion: '1.0.0' }
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({ feishu: entry }))

    expect(getPlugin('feishu')).toEqual(entry)
  })

  it('returns undefined when plugin not found', () => {
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.readFileSync.mockReturnValue('{}')

    expect(getPlugin('nonexistent')).toBeUndefined()
  })
})

describe('hasPlugin', () => {
  it('returns true when plugin exists', () => {
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({
      feishu: { source: 'npm:@bundy-lmw/hive-plugin-feishu', installedAt: '2026-01-01', resolvedVersion: '1.0.0' },
    }))

    expect(hasPlugin('feishu')).toBe(true)
  })

  it('returns false when plugin not found', () => {
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.readFileSync.mockReturnValue('{}')

    expect(hasPlugin('nonexistent')).toBe(false)
  })
})
