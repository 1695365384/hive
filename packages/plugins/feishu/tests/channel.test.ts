/**
 * @hive/plugin-feishu - FeishuChannel Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FeishuChannel } from '../src/channel.js'
import type { IMessageBus, ILogger } from '@hive/core'

// Mock lark SDK - use vi.hoisted for proper hoisting
const { mockCreate, mockReply } = vi.hoisted(() => {
  const mockCreate = vi.fn().mockResolvedValue({
    code: 0,
    msg: 'success',
    data: { message_id: 'msg_123' },
  })
  const mockReply = vi.fn().mockResolvedValue({
    code: 0,
    msg: 'success',
    data: { message_id: 'msg_456' },
  })
  return { mockCreate, mockReply }
})

vi.mock('@larksuiteoapi/node-sdk', () => {
  return {
    Client: class MockClient {
      im = {
        v1: {
          message: {
            create: mockCreate,
            reply: mockReply,
          },
        },
      }
    },
    AppType: { SelfBuild: 'SelfBuild' },
    Domain: { Feishu: 'https://open.feishu.cn' },
  }
})

describe('FeishuChannel', () => {
  let channel: FeishuChannel
  let mockMessageBus: IMessageBus
  let mockLogger: ILogger

  const testConfig = {
    appId: 'cli_test123456',
    appSecret: 'test_secret_123456',
    // 不设置 encryptKey，跳过签名验证（签名验证在 signature.test.ts 中测试）
  }

  beforeEach(() => {
    mockMessageBus = {
      emit: vi.fn(),
      subscribe: vi.fn().mockReturnValue('sub_123'),
      unsubscribe: vi.fn(),
      publish: vi.fn().mockResolvedValue(undefined),
    }

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    channel = new FeishuChannel(testConfig, mockMessageBus, mockLogger)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create channel with correct id', () => {
      expect(channel.id).toBe(`feishu:${testConfig.appId}`)
    })

    it('should create channel with correct type', () => {
      expect(channel.type).toBe('feishu')
    })

    it('should create channel with correct appId', () => {
      expect(channel.appId).toBe(testConfig.appId)
    })

    it('should have correct capabilities', () => {
      expect(channel.capabilities).toEqual({
        sendText: true,
        sendImage: true,
        sendFile: true,
        sendCard: true,
        sendMarkdown: true,
        replyMessage: true,
        editMessage: false,
        deleteMessage: false,
      })
    })
  })

  describe('send', () => {
    it('should send text message successfully', async () => {
      const result = await channel.send({
        to: 'oc_123456',
        content: 'Hello World',
        type: 'text',
      })

      expect(result.success).toBe(true)
      expect(result.messageId).toBe('msg_123')
    })

    it('should send markdown message', async () => {
      const result = await channel.send({
        to: 'oc_123456',
        content: '# Title\n\n**Bold**',
        type: 'markdown',
      })

      expect(result.success).toBe(true)
    })

    it('should handle send error', async () => {
      // Mock error response - use mockCreate from module scope
      mockCreate.mockResolvedValueOnce({
        code: 1001,
        msg: 'Invalid receive_id',
      })

      const result = await channel.send({
        to: 'invalid_id',
        content: 'test',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid receive_id')
    })
  })

  describe('reply', () => {
    it('should reply to message successfully', async () => {
      const result = await channel.reply('msg_original', {
        to: 'oc_123456',
        content: 'Reply content',
        type: 'text',
      })

      expect(result.success).toBe(true)
      expect(result.messageId).toBe('msg_456')
    })
  })

  describe('handleWebhook', () => {
    it('should handle challenge request', async () => {
      const challengeBody = {
        type: 'url_verification',
        challenge: 'test_challenge_string',
        token: testConfig.verificationToken,
      }

      const result = await channel.handleWebhook(
        challengeBody,
        'signature',
        Date.now().toString(),
        'nonce'
      )

      expect(result).toEqual({ challenge: 'test_challenge_string' })
    })

    it('should handle message event', async () => {
      const messageEvent = {
        header: {
          event_id: 'event_123',
          event_type: 'im.message.receive_v1',
          create_time: '1700000000',
          token: testConfig.verificationToken,
          app_id: testConfig.appId,
          tenant_key: 'tenant_123',
          ts: '1700000000',
        },
        event: {
          sender: {
            sender_id: {
              open_id: 'ou_123',
              user_id: 'user_123',
            },
            sender_type: 'app',
            tenant_key: 'tenant_123',
          },
          message: {
            message_id: 'msg_789',
            chat_id: 'oc_123456',
            message_type: 'text',
            content: JSON.stringify({ text: 'Hello' }),
            create_time: '1700000000',
          },
        },
      }

      const result = await channel.handleWebhook(
        messageEvent,
        'signature',
        Date.now().toString(),
        'nonce'
      )

      expect(result).toEqual({ code: 0, msg: 'success' })
      expect(mockMessageBus.emit).toHaveBeenCalled()
    })

    it('should ignore non-message events', async () => {
      const otherEvent = {
        header: {
          event_type: 'other.event',
        },
      }

      const result = await channel.handleWebhook(
        otherEvent,
        'signature',
        Date.now().toString(),
        'nonce'
      )

      expect(result).toEqual({ code: 0, msg: 'ignored' })
    })
  })
})
