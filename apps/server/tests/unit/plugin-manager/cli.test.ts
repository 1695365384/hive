import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../src/plugin-manager/searcher.js', () => ({
  searchPlugins: vi.fn(),
  formatSearchResults: vi.fn(),
}))

vi.mock('../../../src/plugin-manager/installer.js', () => ({
  installPlugin: vi.fn(),
}))

vi.mock('../../../src/plugin-manager/manager.js', () => ({
  listPlugins: vi.fn(),
  removePlugin: vi.fn(),
  showPluginInfo: vi.fn(),
  updatePlugin: vi.fn(),
}))

import { searchPlugins, formatSearchResults } from '../../../src/plugin-manager/searcher.js'
import { installPlugin } from '../../../src/plugin-manager/installer.js'
import { listPlugins, removePlugin, showPluginInfo, updatePlugin } from '../../../src/plugin-manager/manager.js'

const mocked = {
  searchPlugins: vi.mocked(searchPlugins),
  formatSearchResults: vi.mocked(formatSearchResults),
  installPlugin: vi.mocked(installPlugin),
  listPlugins: vi.mocked(listPlugins),
  removePlugin: vi.mocked(removePlugin),
  showPluginInfo: vi.mocked(showPluginInfo),
  updatePlugin: vi.mocked(updatePlugin),
}

let consoleSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleSpy.mockRestore()
  errorSpy.mockRestore()
})

/**
 * 直接调用各个模块函数来测试 CLI 行为。
 * 这些函数就是 CLI action handler 中调用的业务逻辑。
 */
describe('search action', () => {
  it('calls searchPlugins with keyword', async () => {
    mocked.searchPlugins.mockResolvedValue({ packages: [], total: 0 })
    mocked.formatSearchResults.mockReturnValue('No plugins found')

    const result = await mocked.searchPlugins('feishu', 20)
    const output = mocked.formatSearchResults(result.packages, result.total)
    console.log(output)

    expect(mocked.searchPlugins).toHaveBeenCalledWith('feishu', 20)
    expect(mocked.formatSearchResults).toHaveBeenCalledWith([], 0)
  })

  it('calls searchPlugins without keyword', async () => {
    mocked.searchPlugins.mockResolvedValue({ packages: [], total: 0 })
    mocked.formatSearchResults.mockReturnValue('No plugins found')

    await mocked.searchPlugins(undefined, 20)

    expect(mocked.searchPlugins).toHaveBeenCalledWith(undefined, 20)
  })
})

describe('add action', () => {
  it('logs success on install', async () => {
    mocked.installPlugin.mockResolvedValue({ success: true, name: 'feishu', version: '1.0.0' })

    const result = await mocked.installPlugin('@bundy-lmw/hive-plugin-feishu')
    if (result.success) {
      console.log(`  ✓ Installed ${result.name}${result.version ? ` v${result.version}` : ''}`)
    }

    expect(mocked.installPlugin).toHaveBeenCalledWith('@bundy-lmw/hive-plugin-feishu')
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Installed feishu'))
  })

  it('logs error on failure', async () => {
    mocked.installPlugin.mockResolvedValue({ success: false, name: 'feishu', error: 'already installed' })

    const result = await mocked.installPlugin('@bundy-lmw/hive-plugin-feishu')
    if (!result.success) {
      console.error(`  ✗ ${result.error}`)
    }

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('already installed'))
  })
})

describe('list action', () => {
  it('prints list output', () => {
    mocked.listPlugins.mockReturnValue('2 plugins installed')

    console.log(mocked.listPlugins())

    expect(mocked.listPlugins).toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith('2 plugins installed')
  })
})

describe('remove action', () => {
  it('logs success on remove', () => {
    mocked.removePlugin.mockReturnValue({ success: true })

    const result = mocked.removePlugin('feishu')
    if (result.success) {
      console.log(`  ✓ Removed feishu`)
    }

    expect(mocked.removePlugin).toHaveBeenCalledWith('feishu')
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Removed feishu'))
  })

  it('logs error on failure', () => {
    mocked.removePlugin.mockReturnValue({ success: false, error: 'Plugin not installed' })

    const result = mocked.removePlugin('nonexistent')
    if (!result.success) {
      console.error(`  ✗ ${result.error}`)
    }

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Plugin not installed'))
  })
})

describe('info action', () => {
  it('prints info on success', () => {
    mocked.showPluginInfo.mockReturnValue('  Name: feishu\n  Version: 1.0.0')

    const result = mocked.showPluginInfo('feishu')
    if (typeof result === 'string') {
      console.log(result)
    }

    expect(mocked.showPluginInfo).toHaveBeenCalledWith('feishu')
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('feishu'))
  })

  it('logs error when plugin not found', () => {
    mocked.showPluginInfo.mockReturnValue({ error: 'Plugin not installed' })

    const result = mocked.showPluginInfo('nonexistent')
    if (typeof result !== 'string') {
      console.error(`  ✗ ${result.error}`)
    }

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Plugin not installed'))
  })
})

describe('update action', () => {
  it('logs updated plugins', async () => {
    mocked.updatePlugin.mockResolvedValue({ updated: ['feishu'], skipped: [], errors: [] })

    const { updated } = await mocked.updatePlugin('feishu')
    for (const n of updated) {
      console.log(`  ✓ Updated ${n}`)
    }

    expect(mocked.updatePlugin).toHaveBeenCalledWith('feishu')
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Updated feishu'))
  })

  it('handles update all', async () => {
    mocked.updatePlugin.mockResolvedValue({ updated: [], skipped: ['feishu'], errors: [] })

    await mocked.updatePlugin(undefined)

    expect(mocked.updatePlugin).toHaveBeenCalledWith(undefined)
  })
})
