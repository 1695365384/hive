/**
 * Integration test with mock OpenClaw plugin
 *
 * This test simulates loading an OpenClaw-style plugin without
 * depending on the actual @larksuite/openclaw-lark package,
 * which has ESM/CJS compatibility issues.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenClawPluginLoader } from '../src/adapter.js'
import type { OpenClawPluginDefinition, ChannelPlugin } from '../src/types.js'

describe('OpenClaw Adapter with Mock Lark Plugin', () => {
  // Create a mock Lark plugin that mimics @larksuite/openclaw-lark structure
  const createMockLarkPlugin = (): OpenClawPluginDefinition => {
    return {
      id: 'openclaw-lark',
      name: 'Feishu/Lark',
      version: '2026.3.25',
      description: 'Mock Lark/Feishu channel plugin',
      kind: 'channel',
      configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {}
      },
      register: (api) => {
        // Register Feishu channel
        const feishuChannel: ChannelPlugin = {
          id: 'feishu',
          name: 'Feishu Channel',
          channelId: 'feishu',
          capabilities: {
            canSend: true,
            canReceive: true,
            canReply: true,
            canSendMedia: true,
            canReceiveMedia: true,
            supportsThreads: true,
            supportsTyping: false
          },
          init: async () => {
            api.logger.info('[Feishu] Channel initialized')
          },
          sendMessage: async (chatId, content) => {
            api.logger.info(`[Feishu] Sending message to ${chatId}`)
            await api.runtime.emit?.('message:sent', { chatId, content })
          }
        }

        api.registerChannel({ plugin: feishuChannel })

        // Register tools (mimicking real Lark plugin structure)
        const tools = [
          { name: 'sendTextLark', description: 'Send text message to Lark' },
          { name: 'sendCardLark', description: 'Send card message to Lark' },
          { name: 'uploadImageLark', description: 'Upload image to Lark' },
          { name: 'getDocContent', description: 'Get document content' },
          { name: 'searchWiki', description: 'Search wiki pages' },
          { name: 'listDriveFiles', description: 'List drive files' },
          { name: 'createBitable', description: 'Create bitable' },
          { name: 'listTasks', description: 'List tasks' }
        ]

        for (const tool of tools) {
          api.registerTool(tool)
        }

        // Register hooks
        api.registerHook('message:received', async (ctx: unknown) => {
          api.logger.debug('[Feishu] Message received hook triggered')
        })

        api.registerHook('reaction:added', async (ctx: unknown) => {
          api.logger.debug('[Feishu] Reaction added hook triggered')
        })

        // Register service
        api.registerService({
          id: 'lark-client',
          start: async () => {
            api.logger.info('[LarkClient] Service started')
          },
          stop: async () => {
            api.logger.info('[LarkClient] Service stopped')
          }
        })
      },
      activate: async (api) => {
        api.logger.info('[openclaw-lark] Plugin activated')
      }
    }
  }

  let loader: OpenClawPluginLoader
  let mockMessageBus: any
  let mockLogger: any

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

  it('should load mock Lark plugin successfully', async () => {
    const plugin = createMockLarkPlugin()
    loader = new OpenClawPluginLoader(plugin, {
      messageBus: mockMessageBus,
      logger: mockLogger,
      source: 'mock:lark-plugin'
    })

    await loader.load()

    expect(loader.getInfo().state).toBe('loaded')
    expect(loader.getInfo().definition.id).toBe('openclaw-lark')
  })

  it('should register Feishu channel from plugin', async () => {
    const plugin = createMockLarkPlugin()
    loader = new OpenClawPluginLoader(plugin, {
      messageBus: mockMessageBus,
      logger: mockLogger
    })

    await loader.load()

    const channels = loader.getChannels()
    expect(channels).toHaveLength(1)
    expect(channels[0].id).toBe('feishu')
    expect(channels[0].capabilities?.canSend).toBe(true)
    expect(channels[0].capabilities?.supportsThreads).toBe(true)
  })

  it('should register all Lark tools', async () => {
    const plugin = createMockLarkPlugin()
    loader = new OpenClawPluginLoader(plugin, {
      messageBus: mockMessageBus,
      logger: mockLogger
    })

    await loader.load()

    const tools = loader.getTools()
    expect(tools.length).toBe(8)
    expect(tools.some((t: any) => t.name === 'sendTextLark')).toBe(true)
    expect(tools.some((t: any) => t.name === 'getDocContent')).toBe(true)
  })

  it('should register hooks', async () => {
    const plugin = createMockLarkPlugin()
    loader = new OpenClawPluginLoader(plugin, {
      messageBus: mockMessageBus,
      logger: mockLogger
    })

    await loader.load()

    const hooks = loader.getHooks()
    expect(hooks.size).toBe(2)
    expect(hooks.has('message:received')).toBe(true)
    expect(hooks.has('reaction:added')).toBe(true)
  })

  it('should register services', async () => {
    const plugin = createMockLarkPlugin()
    loader = new OpenClawPluginLoader(plugin, {
      messageBus: mockMessageBus,
      logger: mockLogger
    })

    await loader.load()

    const services = loader.getServices()
    expect(services).toHaveLength(1)
    expect(services[0].id).toBe('lark-client')
  })

  it('should activate plugin successfully', async () => {
    const plugin = createMockLarkPlugin()
    loader = new OpenClawPluginLoader(plugin, {
      messageBus: mockMessageBus,
      logger: mockLogger
    })

    await loader.load()
    await loader.activate()

    expect(loader.getInfo().state).toBe('activated')
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('activated')
    )
  })

  it('should handle plugin errors gracefully', async () => {
    const badPlugin: OpenClawPluginDefinition = {
      id: 'bad-plugin',
      register: () => {
        throw new Error('Plugin initialization failed')
      }
    }

    loader = new OpenClawPluginLoader(badPlugin, {
      messageBus: mockMessageBus,
      logger: mockLogger
    })

    await expect(loader.load()).rejects.toThrow('Plugin initialization failed')
    expect(loader.getInfo().state).toBe('error')
  })
})
