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
  removePlugin: vi.fn(),
}))

vi.mock('../../src/plugin-manager/registry.js', () => ({
  loadRegistry: vi.fn().mockReturnValue({}),
}))

import { ChatWsHandler } from '../../src/gateway/ws/chat-handler.js'
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

async function sendAndWait(
  handler: ChatWsHandler,
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

function setup() {
  const handler = new ChatWsHandler()
  const { ws, getSentMessages } = createMockWs()
  handler.handleConnection(ws as any)
  return { handler, ws, getSentMessages }
}

// ============================================
// Tests
// ============================================

describe('ChatWsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('message parsing', () => {
    it('should reject unknown methods', async () => {
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
  })

  describe('chat.send', () => {
    it('should reject when server is not set', async () => {
      const { handler, ws, getSentMessages } = setup()
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('chat.send', { prompt: 'hello' }))
      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('AGENT_NOT_READY')
      expect(res.error.message).toBe('Server not initialized')
    })

    it('should reject when prompt is missing', async () => {
      const { handler, ws, getSentMessages } = setup()
      handler.setServer({ agent: null } as any)
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('chat.send', {}))
      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('VALIDATION')
      expect(res.error.message).toContain('prompt')
    })

    it('should reject when prompt is empty string', async () => {
      const { handler, ws, getSentMessages } = setup()
      handler.setServer({ agent: null } as any)
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('chat.send', { prompt: '' }))
      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('VALIDATION')
    })

    it('should reject when prompt is not a string', async () => {
      const { handler, ws, getSentMessages } = setup()
      handler.setServer({ agent: null } as any)
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('chat.send', { prompt: 123 }))
      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('VALIDATION')
    })

    it('should reject when agent is not initialized', async () => {
      const { handler, ws, getSentMessages } = setup()
      handler.setServer({ agent: undefined } as any)
      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('chat.send', { prompt: 'hello' }))
      const res = messages[0] as any
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('AGENT_NOT_READY')
      expect(res.error.message).toBe('Agent not initialized')
    })

    it('should return threadId and broadcast agent.start when agent is ready', async () => {
      const { handler, ws, getSentMessages } = setup()
      const mockChat = vi.fn().mockResolvedValue('response')
      handler.setServer({ agent: { chat: mockChat } } as any)

      const messages = await sendAndWait(handler, { ws, getSentMessages }, createRequest('chat.send', { prompt: 'hello', threadId: 'tid-1' }))

      await new Promise(resolve => setTimeout(resolve, 10))

      const allMessages = getSentMessages()
      const res = allMessages.find((m: any) => m.id === 'test-req-1' && m.type === 'res') as any
      expect(res).toBeDefined()
      expect(res.success).toBe(true)
      expect(res.result.threadId).toBe('tid-1')

      expect(mockChat).toHaveBeenCalledWith('hello', expect.objectContaining({
        onReasoning: expect.any(Function),
        onText: expect.any(Function),
        onToolCall: expect.any(Function),
        onToolResult: expect.any(Function),
      }))
    })

    it('should deliver events to the originating client only', async () => {
      const { ws: ws1, getSentMessages: getSent1 } = createMockWs()
      const { ws: ws2, getSentMessages: getSent2 } = createMockWs()
      const handler = new ChatWsHandler()
      handler.handleConnection(ws1 as any)
      handler.handleConnection(ws2 as any)

      const mockChat = vi.fn().mockImplementation(async (_prompt, opts) => {
        opts.onText?.('hello')
      })
      handler.setServer({ agent: { chat: mockChat } } as any)

      const messageHandler1 = vi.mocked(ws1.on).mock.calls.find(c => c[0] === 'message')?.[1]!
      messageHandler1({ toString: () => JSON.stringify(createRequest('chat.send', { prompt: 'hi', threadId: 'tid-A' })) })

      await new Promise(resolve => setTimeout(resolve, 10))

      const sent1 = getSent1()
      const startEvent1 = sent1.find((m: any) => m.event === 'agent.start')
      expect(startEvent1).toBeDefined()
      expect(startEvent1.data.threadId).toBe('tid-A')

      const sent2 = getSent2()
      const startEvent2 = sent2.find((m: any) => m.event === 'agent.start')
      expect(startEvent2).toBeUndefined()
    })

    it('should clean up thread mapping on client disconnect', () => {
      const { ws, getSentMessages } = createMockWs()
      const handler = new ChatWsHandler()
      handler.handleConnection(ws as any)
      handler.setServer({ agent: { chat: vi.fn().mockResolvedValue('ok') } } as any)

      const messageHandler = vi.mocked(ws.on).mock.calls.find(c => c[0] === 'message')?.[1]!
      messageHandler({ toString: () => JSON.stringify(createRequest('chat.send', { prompt: 'hi', threadId: 'tid-clean' })) })

      const closeHandler = vi.mocked(ws.on).mock.calls.find(c => c[0] === 'close')?.[1]!
      closeHandler!()

      handler.closeAll()
    })
  })

  describe('connection lifecycle', () => {
    it('should remove client on close', () => {
      const { handler, ws } = setup()
      const closeHandler = vi.mocked(ws.on).mock.calls.find(c => c[0] === 'close')?.[1]
      expect(closeHandler).toBeDefined()
      closeHandler!()
    })

    it('should close all clients', () => {
      const { ws: ws1 } = createMockWs()
      const { ws: ws2 } = createMockWs()
      const handler = new ChatWsHandler()
      handler.handleConnection(ws1 as any)
      handler.handleConnection(ws2 as any)

      handler.closeAll()

      expect(ws1.close).toHaveBeenCalled()
      expect(ws2.close).toHaveBeenCalled()
    })
  })
})
