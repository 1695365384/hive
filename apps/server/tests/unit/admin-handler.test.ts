import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies before importing
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('../../src/config.js', () => ({
  HIVE_HOME: '/tmp/test-hive',
}))

vi.mock('../../src/plugin-manager/index.js', () => ({
  searchPlugins: vi.fn(),
  installPlugin: vi.fn(),
  listPlugins: vi.fn().mockReturnValue('No plugins installed.'),
  removePlugin: vi.fn(),
}))

vi.mock('../../src/plugin-manager/registry.js', () => ({
  loadRegistry: vi.fn().mockReturnValue({}),
  saveRegistry: vi.fn(),
  addPlugin: vi.fn(),
  removePlugin: vi.fn(),
  getPlugin: vi.fn(),
  hasPlugin: vi.fn(),
}))

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { searchPlugins, installPlugin, removePlugin } from '../../src/plugin-manager/index.js'
import { loadRegistry } from '../../src/plugin-manager/registry.js'
import { AdminWsHandler } from '../../src/gateway/ws/admin-handler.js'
import { LogBuffer } from '../../src/gateway/ws/log-buffer.js'
import type { WsRequest } from '../../src/gateway/ws/types.js'

// ============================================
// Mock WebSocket
// ============================================

interface MockWs {
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  readyState: number
  OPEN: number
  on: ReturnType<typeof vi.fn>
}

interface MockWsContext {
  ws: MockWs
  getSentMessages: () => unknown[]
}

function createMockWs(): MockWsContext {
  const sentMessages: unknown[] = []
  const ws: MockWs = {
    send: vi.fn((msg: string) => sentMessages.push(JSON.parse(msg))),
    close: vi.fn(),
    readyState: 1,
    OPEN: 1,
    on: vi.fn(),
  }
  return { ws, getSentMessages: () => sentMessages }
}

function createRequest(method: string, params?: unknown, id = 'test-req-1'): WsRequest {
  return { id, type: 'req', method, params, timestamp: Date.now() }
}

/**
 * Helper: send a request through the handler's WebSocket message listener
 * and wait for the async response to be sent.
 */
async function sendAndWait(
  handler: AdminWsHandler,
  ctx: { ws: MockWs; getSentMessages: () => unknown[] },
  req: WsRequest,
): Promise<unknown[]> {
  const ws = ctx.ws
  const messageHandler = vi.mocked(ws.on).mock.calls.find(c => c[0] === 'message')?.[1]
  if (!messageHandler) throw new Error('No message handler registered')

  messageHandler({ toString: () => JSON.stringify(req) })
  await new Promise(resolve => setTimeout(resolve, 0))

  return ctx.getSentMessages()
}

/**
 * Helper: setup a handler with a connected WebSocket, return handler + context.
 */
function setup() {
  const logBuffer = new LogBuffer()
  const handler = new AdminWsHandler(null, logBuffer)
  const { ws, getSentMessages } = createMockWs()
  handler.handleConnection(ws as any)
  return { handler, ws, getSentMessages }
}

// ============================================
// Tests
// ============================================

describe('AdminWsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(mkdirSync).mockImplementation(() => '/tmp/test-hive' as any)
    vi.mocked(readFileSync).mockReturnValue('{}')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ============================================
  // Message Parsing
  // ============================================

  describe('message parsing', () => {
    it('should reject invalid JSON', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messageHandler = vi.mocked(ws.on).mock.calls.find(c => c[0] === 'message')?.[1]!
      messageHandler({ toString: () => 'not-json' })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(ws.send).not.toHaveBeenCalled()
    })

    it('should reject messages without type=req', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messageHandler = vi.mocked(ws.on).mock.calls.find(c => c[0] === 'message')?.[1]!
      messageHandler({ toString: () => JSON.stringify({ type: 'event', id: '1' }) })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(ws.send).not.toHaveBeenCalled()
    })

    it('should reject messages without id', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messageHandler = vi.mocked(ws.on).mock.calls.find(c => c[0] === 'message')?.[1]!
      messageHandler({ toString: () => JSON.stringify({ type: 'req', method: 'test' }) })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(ws.send).not.toHaveBeenCalled()
    })

    it('should reject messages without method', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messageHandler = vi.mocked(ws.on).mock.calls.find(c => c[0] === 'message')?.[1]!
      messageHandler({ toString: () => JSON.stringify({ type: 'req', id: '1' }) })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(ws.send).not.toHaveBeenCalled()
    })

    it('should return NOT_FOUND for unknown methods', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('foo.bar'))

      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        id: 'test-req-1',
        type: 'res',
        success: false,
        error: { code: 'NOT_FOUND', message: 'Unknown method: foo.bar' },
      })
    })

    it('should return NOT_FOUND for chat.send (moved to /ws/chat)', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('chat.send', { prompt: 'hello' }))

      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        id: 'test-req-1',
        type: 'res',
        success: false,
        error: { code: 'NOT_FOUND', message: 'Unknown method: chat.send' },
      })
    })
  })

  // ============================================
  // Config Handlers
  // ============================================

  describe('config.get', () => {
    it('should return default config when no config file exists', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('config.get'))

      expect(messages).toHaveLength(1)
      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(res.result.server.port).toBe(4450)
      expect(res.result.server.host).toBe('127.0.0.1')
      expect(res.result.provider.id).toBe('glm')
    })

    it('should load config from file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        server: { port: 8080 },
        provider: { id: 'openai', apiKey: 'sk-test-12345' },
      }))

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('config.get'))

      expect(messages).toHaveLength(1)
      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(res.result.server.port).toBe(8080)
      expect(res.result.provider.id).toBe('openai')
    })

    it('should sanitize apiKey in config.get response', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        auth: { apiKey: 'very-secret-key-abc' },
        provider: { apiKey: 'sk-1234567890abcdef' },
      }))

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('config.get'))

      const res = messages[0] as any
      expect(res.result.auth.apiKey).not.toBe('very-secret-key-abc')
      expect(res.result.auth.apiKey).toBe('***abc')
      expect(res.result.provider.apiKey).not.toBe('sk-1234567890abcdef')
      expect(res.result.provider.apiKey).toBe('***def')
    })

    it('should show *** for short apiKey', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        provider: { apiKey: 'ab' },
      }))

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('config.get'))

      const res = messages[0] as any
      expect(res.result.provider.apiKey).toBe('***')
    })

    it('should show *** for empty apiKey', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        provider: { apiKey: '' },
      }))

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('config.get'))

      const res = messages[0] as any
      expect(res.result.provider.apiKey).toBe('***')
    })
  })

  describe('config.update', () => {
    it('should update provider config and write file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('{}')

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('config.update', {
        provider: { id: 'anthropic', apiKey: 'sk-ant-test' },
      }))

      expect(messages.length).toBeGreaterThanOrEqual(2)
      const event = messages.find((m: any) => m.type === 'event')!
      const res = messages.find((m: any) => m.type === 'res')!

      expect(res.success).toBe(true)
      expect(res.result.success).toBe(true)
      expect(writeFileSync).toHaveBeenCalled()

      expect(event.event).toBe('config.changed')
      expect(event.data.keys).toContain('provider')
    })

    it('should update server config', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('{}')

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('config.update', {
        server: { port: 3000, logLevel: 'debug' },
      }))

      const res = messages.find((m: any) => m.type === 'res')!
      expect(res.success).toBe(true)
      expect(writeFileSync).toHaveBeenCalled()
    })
  })

  describe('config.getProviderPresets', () => {
    it('should return error when server is not initialized', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('config.getProviderPresets'))

      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('INTERNAL')
    })

    it('should return presets from server', async () => {
      const { handler, ws, getSentMessages } = setup()
      handler.setServer({
        agent: { listPresets: vi.fn().mockReturnValue([{ id: 'glm', name: 'GLM', type: 'openai-compatible' }]) },
      } as any)

      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('config.getProviderPresets'))

      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(res.result).toHaveLength(1)
      expect(res.result[0].id).toBe('glm')
    })

    it('should return empty array on error', async () => {
      const { handler, ws, getSentMessages } = setup()
      handler.setServer({
        agent: { listPresets: vi.fn().mockImplementation(() => { throw new Error('fail') }) },
      } as any)

      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('config.getProviderPresets'))

      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(res.result).toEqual([])
    })
  })

  // ============================================
  // Status Handlers
  // ============================================

  describe('status.get', () => {
    it('should return running status without server', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('status.get'))

      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(res.result.server.state).toBe('running')
      expect(res.result.agent.initialized).toBe(false)
      expect(res.result.agent.providerReady).toBe(false)
      expect(res.result.system.nodeVersion).toBe(process.version)
      expect(res.result.system.memory.rss).toBeGreaterThan(0)
    })

    it('should show providerReady=true when provider has apiKey', async () => {
      const { handler, ws, getSentMessages } = setup()
      handler.setServer({
        agent: { currentProvider: { id: 'glm', apiKey: 'sk-12345' } },
      } as any)

      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('status.get'))

      const res = messages[0] as any
      expect(res.result.agent.providerReady).toBe(true)
      expect(res.result.agent.currentProvider).toBe('glm')
    })

    it('should show providerReady=false when apiKey is empty', async () => {
      const { handler, ws, getSentMessages } = setup()
      handler.setServer({
        agent: { currentProvider: { id: 'glm', apiKey: '' } },
      } as any)

      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('status.get'))

      const res = messages[0] as any
      expect(res.result.agent.providerReady).toBe(false)
    })
  })

  // ============================================
  // Server Handlers
  // ============================================

  describe('server.restart', () => {
    it('should return success and broadcast shutting_down event', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('server.restart'))

      const res = messages.find((m: any) => m.type === 'res')!
      const event = messages.find((m: any) => m.type === 'event')!

      expect(res).toMatchObject({
        id: 'test-req-1', type: 'res', success: true,
      })
      expect(event).toMatchObject({
        type: 'event', event: 'server.shutting_down', data: { reason: 'restart' },
      })
    })

    it('should schedule process.exit after 300ms', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })

      const { handler, ws, getSentMessages } = setup()
      const messageHandler = vi.mocked(ws.on).mock.calls.find(c => c[0] === 'message')?.[1]!
      messageHandler({ toString: () => JSON.stringify(createRequest('server.restart')) })
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(ws.send).toHaveBeenCalled()
      expect(exitSpy).not.toHaveBeenCalled()

      exitSpy.mockRestore()
    })
  })

  describe('server.getProviders', () => {
    it('should return error when server is not initialized', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('server.getProviders'))

      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('INTERNAL')
    })

    it('should return providers from server', async () => {
      const { handler, ws, getSentMessages } = setup()
      handler.setServer({
        agent: { listProviders: vi.fn().mockReturnValue([{ id: 'glm', name: 'GLM' }]) },
      } as any)

      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('server.getProviders'))

      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(res.result).toHaveLength(1)
    })
  })

  describe('provider.list', () => {
    it('should return error when server is not initialized', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('provider.list'))

      const res = messages[0] as any
      expect(res.success).toBe(false)
    })

    it('should return providers with summary info', async () => {
      const { handler, ws, getSentMessages } = setup()
      handler.setServer({
        agent: {
          listAllProviders: vi.fn().mockResolvedValue([
            { id: 'glm', name: 'GLM', logo: 'glm.svg', type: 'openai-compatible', models: [{ id: 'glm-4' }] },
          ]),
        },
      } as any)

      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('provider.list'))

      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(res.result).toHaveLength(1)
      expect(res.result[0].modelCount).toBe(1)
      expect(res.result[0].defaultModel).toBe('glm-4')
    })
  })

  describe('provider.getModels', () => {
    it('should validate providerId', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('provider.getModels', {}))

      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('VALIDATION')
    })

    it('should return models for provider', async () => {
      const { handler, ws, getSentMessages } = setup()
      handler.setServer({
        agent: {
          listProviderModels: vi.fn().mockResolvedValue([
            { id: 'glm-4', name: 'GLM-4', family: 'glm', contextWindow: 8192, maxOutputTokens: 4096 },
          ]),
        },
      } as any)

      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('provider.getModels', { providerId: 'glm' }))

      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(res.result).toHaveLength(1)
      expect(res.result[0].id).toBe('glm-4')
    })
  })

  // ============================================
  // Plugin Handlers
  // ============================================

  describe('plugin.available', () => {
    it('should return available plugins from npm search', async () => {
      vi.mocked(searchPlugins).mockResolvedValue({
        packages: [
          { name: '@bundy-lmw/hive-plugin-feishu', version: '1.0.1', description: '飞书消息通道插件' },
        ],
        total: 1,
      })

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('plugin.available'))

      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(res.result).toHaveLength(1)
      expect(res.result[0].name).toBe('@bundy-lmw/hive-plugin-feishu')
      expect(res.result[0].version).toBe('1.0.1')
      expect(searchPlugins).toHaveBeenCalledWith(undefined)
    })

    it('should pass keyword to search', async () => {
      vi.mocked(searchPlugins).mockResolvedValue({ packages: [], total: 0 })

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('plugin.available', { keyword: 'feishu' }))

      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(searchPlugins).toHaveBeenCalledWith('feishu')
    })

    it('should return error on search failure', async () => {
      vi.mocked(searchPlugins).mockRejectedValue(new Error('Network error'))

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('plugin.available'))

      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('INTERNAL')
      expect(res.error.message).toBe('Network error')
    })
  })

  describe('plugin.list', () => {
    it('should return empty list when no plugins installed', async () => {
      vi.mocked(loadRegistry).mockReturnValue({})

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('plugin.list'))

      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(res.result).toEqual([])
    })

    it('should return plugins from registry with config', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(loadRegistry).mockReturnValue({
        'feishu': {
          source: 'npm:@bundy-lmw/hive-plugin-feishu@1.0.1',
          installedAt: '2026-03-30T00:00:00.000Z',
          resolvedVersion: '1.0.1',
        },
      })
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        plugins: {
          feishu: { appId: 'test-app', appSecret: 'test-secret' },
        },
      }))

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('plugin.list'))

      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(res.result).toHaveLength(1)
      expect(res.result[0].name).toBe('@bundy-lmw/hive-plugin-feishu')
      expect(res.result[0].version).toBe('1.0.1')
      expect(res.result[0].config).toEqual({ appId: 'test-app', appSecret: 'test-secret' })
      expect(res.result[0].enabled).toBe(true)
    })
  })

  describe('plugin.install', () => {
    it('should validate source parameter', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('plugin.install', {}))

      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('VALIDATION')
    })

    it('should install plugin and broadcast event', async () => {
      vi.mocked(installPlugin).mockResolvedValue({
        success: true,
        name: '@bundy-lmw/hive-plugin-test',
        version: '1.0.0',
      })

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('plugin.install', {
        source: '@bundy-lmw/hive-plugin-test',
      }))

      const res = messages.find((m: any) => m.type === 'res')!
      expect(res.success).toBe(true)
      expect(res.result.id).toBe('@bundy-lmw/hive-plugin-test')
      expect(res.result.version).toBe('1.0.0')
      expect(res.result.enabled).toBe(true)

      const event = messages.find((m: any) => m.type === 'event')!
      expect(event.event).toBe('plugin.installed')
      expect(event.data.name).toBe('@bundy-lmw/hive-plugin-test')
    })

    it('should return error when installPlugin fails', async () => {
      vi.mocked(installPlugin).mockResolvedValue({
        success: false,
        name: '',
        error: 'Package not found',
      })

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('plugin.install', {
        source: '@bundy-lmw/hive-plugin-nonexist',
      }))

      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('INTERNAL')
      expect(res.error.message).toBe('Package not found')
    })
  })

  describe('plugin.uninstall', () => {
    it('should validate id parameter', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('plugin.uninstall', {}))

      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('VALIDATION')
    })

    it('should uninstall plugin and clean config', async () => {
      vi.mocked(removePlugin).mockReturnValue({ success: true })
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        pluginConfigs: { 'test-plugin': { key: 'val' } },
      }))

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('plugin.uninstall', {
        id: 'test-plugin',
      }))

      const res = messages.find((m: any) => m.type === 'res')!
      expect(res.success).toBe(true)
      expect(removePlugin).toHaveBeenCalledWith('test-plugin')

      const event = messages.find((m: any) => m.type === 'event')!
      expect(event.event).toBe('plugin.uninstalled')
      expect(event.data.id).toBe('test-plugin')
    })
  })

  describe('plugin.updateConfig', () => {
    it('should validate id and config parameters', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('plugin.updateConfig', { id: 'test' }))

      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('VALIDATION')
    })

    it('should write plugin config and broadcast event', async () => {
      vi.mocked(readFileSync).mockReturnValue('{}')

      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('plugin.updateConfig', {
        id: 'feishu',
        config: { appId: 'new-app-id', appSecret: 'new-secret' },
      }))

      const event = messages.find((m: any) => m.type === 'event')!
      expect(event.event).toBe('plugin.configChanged')
      expect(event.data.id).toBe('feishu')
      expect(event.data.config).toEqual({ appId: 'new-app-id', appSecret: 'new-secret' })

      const res = messages.find((m: any) => m.type === 'res')!
      expect(res.success).toBe(true)
      expect(writeFileSync).toHaveBeenCalled()
    })
  })

  // ============================================
  // Log Handlers
  // ============================================

  describe('log.getHistory', () => {
    it('should return log entries', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('log.getHistory', { limit: 10 }))

      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(Array.isArray(res.result)).toBe(true)
    })

    it('should filter by level', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('log.getHistory', { level: 'error' }))

      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(res.result.every((e: any) => e.level === 'error')).toBe(true)
    })
  })

  describe('log.subscribe / log.unsubscribe', () => {
    it('should mark client as logSubscribed', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('log.subscribe'))

      const res = messages[0] as any
      expect(res.success).toBe(true)
    })

    it('should unmark client on unsubscribe', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('log.unsubscribe'))

      const res = messages[0] as any
      expect(res.success).toBe(true)
    })
  })

  // ============================================
  // Session Handlers
  // ============================================

  describe('session.list', () => {
    it('should return empty array', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('session.list'))

      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(res.result).toEqual([])
    })
  })

  describe('session.get', () => {
    it('should validate id parameter', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('session.get', {}))

      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('VALIDATION')
    })

    it('should return null for session', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('session.get', { id: 'session-1' }))

      const res = messages[0] as any
      expect(res.success).toBe(true)
      expect(res.result).toBeNull()
    })
  })

  describe('session.delete', () => {
    it('should validate id parameter', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('session.delete', {}))

      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('VALIDATION')
    })

    it('should return success for delete', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('session.delete', { id: 'session-1' }))

      const res = messages[0] as any
      expect(res.success).toBe(true)
    })
  })

  // ============================================
  // Connection Lifecycle
  // ============================================

  describe('connection lifecycle', () => {
    it('should remove client on close', () => {
      const { handler, ws } = setup()
      const closeHandler = vi.mocked(ws.on).mock.calls.find(c => c[0] === 'close')?.[1]
      expect(closeHandler).toBeDefined()
      closeHandler!()
    })

    it('should remove client on error', () => {
      const { handler, ws } = setup()
      const errorHandler = vi.mocked(ws.on).mock.calls.find(c => c[0] === 'error')?.[1]
      expect(errorHandler).toBeDefined()
      errorHandler!()
    })

    it('should close all clients and broadcast shutting_down', () => {
      const { ws: ws1 } = createMockWs()
      const { ws: ws2 } = createMockWs()
      const handler = new AdminWsHandler(null, new LogBuffer())
      handler.handleConnection(ws1 as any)
      handler.handleConnection(ws2 as any)

      handler.closeAll()

      expect(ws1.close).toHaveBeenCalled()
      expect(ws2.close).toHaveBeenCalled()
      expect(ws1.send).toHaveBeenCalledWith(expect.stringContaining('server.shutting_down'))
      expect(ws2.send).toHaveBeenCalledWith(expect.stringContaining('server.shutting_down'))
    })
  })

  // ============================================
  // Error Handling
  // ============================================

  describe('error handling', () => {
    it('should catch handler errors and return INTERNAL error', async () => {
      const { handler, ws, getSentMessages } = setup()
      handler.setServer({
        agent: {
          listAllProviders: vi.fn().mockImplementation(() => { throw new Error('DB connection failed') }),
        },
      } as any)

      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('provider.list'))

      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('INTERNAL')
      expect(res.error.message).toBe('DB connection failed')
    })
  })
})
