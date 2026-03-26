/**
 * Integration test for loading @larksuite/openclaw-lark plugin
 *
 * This test verifies that the OpenClaw adapter can successfully load
 * the real OpenClaw Lark/Feishu plugin.
 *
 * Run: pnpm --filter @hive/openclaw-adapter test:integration
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { OpenClawPluginLoader } from '../src/adapter.js'

// Skip this test suite if the plugin is not installed
const maybeDescribe = process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip

maybeDescribe('OpenClaw Lark Plugin Integration', () => {
  let plugin: any
  let loader: OpenClawPluginLoader
  let mockMessageBus: any
  let mockLogger: any

  beforeAll(async () => {
    // Try to load the OpenClaw Lark plugin
    try {
      const module = await import('@larksuite/openclaw-lark')
      plugin = module.default || module
    } catch (error) {
      console.warn('Skipping integration test: @larksuite/openclaw-lark not installed')
      throw error
    }
  })

  beforeEach(() => {
    mockMessageBus = {
      subscribe: vi.fn().mockReturnValue('sub-123'),
      unsubscribe: vi.fn().mockReturnValue(true),
      publish: vi.fn().mockResolvedValue(undefined)
    }

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  })

  it('should load the OpenClaw Lark plugin', async () => {
    expect(plugin).toBeDefined()
    expect(plugin.id).toBe('openclaw-lark')

    loader = new OpenClawPluginLoader(plugin, {
      messageBus: mockMessageBus,
      logger: mockLogger,
      source: 'npm:@larksuite/openclaw-lark'
    })

    await loader.load()

    expect(loader.getInfo().state).toBe('loaded')
  })

  it('should register channels from the Lark plugin', async () => {
    const channels = loader.getChannels()

    expect(channels.length).toBeGreaterThan(0)
    expect(channels.some(ch => ch.id === 'feishu' || ch.channelId === 'feishu')).toBe(true)
  })

  it('should register tools from the Lark plugin', async () => {
    const tools = loader.getTools()

    // The Lark plugin should register multiple tools
    // (doc, wiki, drive, bitable, task, calendar, etc.)
    expect(tools.length).toBeGreaterThan(0)
  })

  it('should activate the plugin successfully', async () => {
    await loader.activate()

    expect(loader.getInfo().state).toBe('activated')
  })
})
