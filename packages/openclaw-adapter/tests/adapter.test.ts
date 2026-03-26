import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenClawPluginLoader } from '../src/adapter.js'
import type { OpenClawPluginDefinition, ChannelPlugin } from '../src/types.js'

describe('OpenClawPluginLoader', () => {
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
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    }
  })

  describe('load', () => {
    it('should load a valid OpenClaw plugin', async () => {
      const plugin: OpenClawPluginDefinition = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin',
        register: vi.fn()
      }

      loader = new OpenClawPluginLoader(plugin, {
        messageBus: mockMessageBus,
        logger: mockLogger,
        source: 'test'
      })

      await loader.load()

      expect(loader.getInfo().state).toBe('loaded')
      expect(loader.getInfo().definition.id).toBe('test-plugin')
    })

    it('should call register function with API', async () => {
      const plugin: OpenClawPluginDefinition = {
        id: 'test-plugin',
        name: 'Test Plugin',
        register: vi.fn()
      }

      loader = new OpenClawPluginLoader(plugin, {
        messageBus: mockMessageBus,
        logger: mockLogger
      })

      await loader.load()

      expect(plugin.register).toHaveBeenCalledWith(expect.any(Object))
    })
  })

  describe('channels', () => {
    it('should register channels from plugin', async () => {
      const plugin: OpenClawPluginDefinition = {
        id: 'test-plugin',
        register: (api) => {
          const channel: ChannelPlugin = {
            id: 'test-channel',
            name: 'Test Channel',
            channelId: 'test-channel-id',
            capabilities: { canSend: true }
          }
          api.registerChannel({ plugin: channel })
        }
      }

      loader = new OpenClawPluginLoader(plugin, {
        messageBus: mockMessageBus,
        logger: mockLogger
      })

      await loader.load()

      const channels = loader.getChannels()
      expect(channels).toHaveLength(1)
      expect(channels[0].id).toBe('test-channel')
    })
  })

  describe('error handling', () => {
    it('should handle load errors', async () => {
      const plugin: OpenClawPluginDefinition = {
        id: 'bad-plugin',
        register: () => {
          throw new Error('Load failed')
        }
      }

      loader = new OpenClawPluginLoader(plugin, {
        messageBus: mockMessageBus,
        logger: mockLogger
      })

      await expect(loader.load()).rejects.toThrow('Load failed')
      expect(loader.getInfo().state).toBe('error')
    })
  })

  describe('activate', () => {
    it('should activate plugin with activate hook', async () => {
      const plugin: OpenClawPluginDefinition = {
        id: 'test-plugin',
        name: 'Test Plugin',
        register: vi.fn(),
        activate: vi.fn()
      }

      loader = new OpenClawPluginLoader(plugin, {
        messageBus: mockMessageBus,
        logger: mockLogger
      })

      await loader.load()
      await loader.activate()

      expect(plugin.activate).toHaveBeenCalled()
      expect(loader.getInfo().state).toBe('activated')
    })
  })
})
