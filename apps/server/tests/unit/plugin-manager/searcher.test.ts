import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { searchPlugins, formatSearchResults } from '../../../src/plugin-manager/searcher.js'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('searchPlugins', () => {
  it('returns packages and total from npm Registry', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        objects: [
          { package: { name: '@bundy-lmw/hive-plugin-feishu', version: '1.0.0', description: '飞书插件' }, score: { final: 1 } },
          { package: { name: '@bundy-lmw/hive-plugin-wechat', version: '0.5.0', description: '微信插件' }, score: { final: 0.9 } },
        ],
        total: 2,
      }),
    })

    const result = await searchPlugins('feishu')

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('feishu%20keywords%3Ahive-plugin'))
    expect(result.packages).toHaveLength(2)
    expect(result.total).toBe(2)
    expect(result.packages[0].name).toBe('@bundy-lmw/hive-plugin-feishu')
  })

  it('returns all hive-plugin scoped packages when no keyword', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        objects: [
          { package: { name: '@bundy-lmw/hive-plugin-a', version: '1.0.0' }, score: { final: 1 } },
        ],
        total: 1,
      }),
    })

    const result = await searchPlugins()

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('keywords%3Ahive-plugin'))
    expect(result.packages).toHaveLength(1)
  })

  it('respects size parameter', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        objects: [],
        total: 100,
      }),
    })

    await searchPlugins('test', 50)

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('size=50'))
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })

    await expect(searchPlugins('test')).rejects.toThrow('npm Registry returned 500')
  })

  it('throws user-friendly message on network error', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'))

    await expect(searchPlugins('test')).rejects.toThrow('Network error')
  })
})

describe('formatSearchResults', () => {
  it('formats packages as table', () => {
    const output = formatSearchResults(
      [
        { name: '@bundy-lmw/hive-plugin-feishu', version: '1.0.0', description: '飞书消息收发' },
        { name: '@bundy-lmw/hive-plugin-wechat', version: '0.5.0', description: '微信插件' },
      ],
      2,
    )

    expect(output).toContain('@bundy-lmw/hive-plugin-feishu')
    expect(output).toContain('v1.0.0')
    expect(output).toContain('飞书消息收发')
    expect(output).toContain('hive plugin add')
    expect(output).toContain('2 of 2 plugin(s)')
  })

  it('shows no plugins message for empty results', () => {
    const output = formatSearchResults([], 0)

    expect(output).toContain('No plugins found')
    expect(output).toContain('hive plugin search')
  })
})
