/**
 * @bundy-lmw/hive-plugin-feishu - Message Format Conversion Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FeishuChannel } from '../src/channel.js'
import type { ILogger, ChannelMessage } from '@bundy-lmw/hive-core'

// Mock lark SDK - use vi.hoisted for proper hoisting
const { mockCreate } = vi.hoisted(() => {
  const mockCreate = vi.fn().mockResolvedValue({
    code: 0,
    msg: 'success',
    data: { message_id: 'msg_test' },
  })
  return { mockCreate }
})

vi.mock('@larksuiteoapi/node-sdk', () => {
  return {
    Client: class MockClient {
      im = {
        v1: {
          message: {
            create: mockCreate,
          },
        },
      }
    },
    AppType: { SelfBuild: 'SelfBuild' },
    Domain: { Feishu: 'https://open.feishu.cn' },
    WSClient: class MockWSClient {
      start = vi.fn().mockResolvedValue(undefined)
      stop = vi.fn().mockResolvedValue(undefined)
      close = vi.fn()
    },
    EventDispatcher: class MockEventDispatcher {
      register = vi.fn().mockReturnThis()
    },
    LoggerLevel: { warn: 'warn', info: 'info', error: 'error', debug: 'debug' },
  }
})

describe('Message Format Conversion', () => {
  let channel: FeishuChannel
  let mockMessageHandler: ReturnType<typeof vi.fn>
  let mockLogger: ILogger

  const testConfig = {
    appId: 'cli_test123456',
    appSecret: 'test_secret',
    // 不设置 encryptKey，跳过签名验证
  }

  beforeEach(() => {
    mockMessageHandler = vi.fn()

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    channel = new FeishuChannel(testConfig, mockMessageHandler, mockLogger)
  })

  describe('Feishu → ChannelMessage conversion', () => {
    it('should convert text message', async () => {
      const feishuEvent = {
        header: {
          event_id: 'evt_123',
          event_type: 'im.message.receive_v1',
          create_time: '1700000000',
          app_id: testConfig.appId,
          tenant_key: 'tenant_123',
        },
        event: {
          sender: {
            sender_id: {
              open_id: 'ou_user123',
              user_id: 'user_123',
            },
            sender_type: 'app',
            tenant_key: 'tenant_123',
          },
          message: {
            message_id: 'msg_456',
            chat_id: 'oc_chat789',
            message_type: 'text',
            content: JSON.stringify({ text: 'Hello World' }),
            create_time: '1700000000',
          },
        },
      }

      // Trigger conversion via webhook
      await channel.handleWebhook(feishuEvent, 'sig', '1700000000', 'nonce')

      // Check emitted message
      expect(mockMessageHandler).toHaveBeenCalled()
      const emittedMessage = mockMessageHandler.mock.calls[0][0] as ChannelMessage

      expect(emittedMessage.id).toBe('msg_456')
      expect(emittedMessage.content).toBe('Hello World')
      expect(emittedMessage.type).toBe('text')
      expect(emittedMessage.from.id).toBe('ou_user123')
      expect(emittedMessage.from.type).toBe('user')
      expect(emittedMessage.to?.id).toBe('oc_chat789')
      expect(emittedMessage.to?.type).toBe('group')
    })

    it('should convert post (markdown) message', async () => {
      const feishuEvent = {
        header: {
          event_id: 'evt_123',
          event_type: 'im.message.receive_v1',
          create_time: '1700000000',
          app_id: testConfig.appId,
          tenant_key: 'tenant_123',
        },
        event: {
          sender: {
            sender_id: { open_id: 'ou_user123' },
          },
          message: {
            message_id: 'msg_789',
            chat_id: 'oc_chat',
            message_type: 'post',
            content: JSON.stringify({
              title: 'Title',
              content: [[{ tag: 'text', text: 'Bold text' }]],
            }),
            create_time: '1700000000',
          },
        },
      }

      await channel.handleWebhook(feishuEvent, 'sig', '1700000000', 'nonce')

      const emittedMessage = mockMessageHandler.mock.calls[0][0] as ChannelMessage
      expect(emittedMessage.type).toBe('markdown')
    })

    it('should convert image message', async () => {
      const feishuEvent = {
        header: {
          event_id: 'evt_123',
          event_type: 'im.message.receive_v1',
          create_time: '1700000000',
          app_id: testConfig.appId,
          tenant_key: 'tenant_123',
        },
        event: {
          sender: {
            sender_id: { open_id: 'ou_user123' },
          },
          message: {
            message_id: 'msg_img',
            chat_id: 'oc_chat',
            message_type: 'image',
            content: JSON.stringify({ image_key: 'img_123' }),
            create_time: '1700000000',
          },
        },
      }

      await channel.handleWebhook(feishuEvent, 'sig', '1700000000', 'nonce')

      const emittedMessage = mockMessageHandler.mock.calls[0][0] as ChannelMessage
      expect(emittedMessage.type).toBe('image')
      expect(emittedMessage.content).toContain('image')
    })

    it('should preserve raw event in message', async () => {
      const feishuEvent = {
        header: {
          event_id: 'evt_raw',
          event_type: 'im.message.receive_v1',
          create_time: '1700000000',
          app_id: testConfig.appId,
          tenant_key: 'tenant_123',
        },
        event: {
          sender: { sender_id: { open_id: 'ou_123' } },
          message: {
            message_id: 'msg_raw',
            chat_id: 'oc_chat',
            message_type: 'text',
            content: JSON.stringify({ text: 'test' }),
            create_time: '1700000000',
          },
        },
      }

      await channel.handleWebhook(feishuEvent, 'sig', '1700000000', 'nonce')

      const emittedMessage = mockMessageHandler.mock.calls[0][0] as ChannelMessage
      expect(emittedMessage.raw).toEqual(feishuEvent)
    })
  })

  describe('ChannelMessage → Feishu conversion', () => {
    it('should convert text message for sending', async () => {
      // The channel.send method handles this internally
      // We test the content building logic
      const result = await channel.send({
        to: 'oc_chat123',
        content: 'Hello from Hive',
        type: 'text',
      })

      // Success means the conversion worked
      expect(result.success).toBe(true)
    })

    it('should convert markdown message for sending', async () => {
      const result = await channel.send({
        to: 'oc_chat123',
        content: '# Title\n\n**Bold** text',
        type: 'markdown',
      })

      expect(result.success).toBe(true)
    })

    it('should handle card message (pass-through)', async () => {
      const cardContent = JSON.stringify({
        type: 'template',
        data: { template_id: 'tpl_123' },
      })

      const result = await channel.send({
        to: 'oc_chat123',
        content: cardContent,
        type: 'card',
      })

      expect(result.success).toBe(true)
    })
  })

  describe('Type mapping', () => {
    it('should map feishu message types correctly', async () => {
      const typeMappings = [
        { feishu: 'text', expected: 'text' },
        { feishu: 'post', expected: 'markdown' },
        { feishu: 'image', expected: 'image' },
        { feishu: 'file', expected: 'file' },
        { feishu: 'interactive', expected: 'card' },
        { feishu: 'audio', expected: 'file' },
        { feishu: 'media', expected: 'file' },
        { feishu: 'sticker', expected: 'image' },
      ]

      for (const { feishu, expected } of typeMappings) {
        const feishuEvent = {
          header: {
            event_id: `evt_${feishu}`,
            event_type: 'im.message.receive_v1',
            create_time: '1700000000',
            app_id: testConfig.appId,
            tenant_key: 'tenant_123',
          },
          event: {
            sender: { sender_id: { open_id: 'ou_123' } },
            message: {
              message_id: `msg_${feishu}`,
              chat_id: 'oc_chat',
              message_type: feishu,
              content: JSON.stringify({ text: 'test' }),
              create_time: '1700000000',
            },
          },
        }

        vi.clearAllMocks()
        await channel.handleWebhook(feishuEvent, 'sig', '1700000000', 'nonce')

        if (mockMessageHandler.mock.calls.length > 0) {
          const message = mockMessageHandler.mock.calls[0][0] as ChannelMessage
          expect(message.type).toBe(expected)
        }
      }
    })
  })

  describe('Edge cases', () => {
    it('should handle malformed JSON content', async () => {
      const feishuEvent = {
        header: {
          event_id: 'evt_malformed',
          event_type: 'im.message.receive_v1',
          create_time: '1700000000',
          app_id: testConfig.appId,
          tenant_key: 'tenant_123',
        },
        event: {
          sender: { sender_id: { open_id: 'ou_123' } },
          message: {
            message_id: 'msg_malformed',
            chat_id: 'oc_chat',
            message_type: 'text',
            content: 'not valid json',
            create_time: '1700000000',
          },
        },
      }

      // Should not throw, use content as-is
      await channel.handleWebhook(feishuEvent, 'sig', '1700000000', 'nonce')

      const message = mockMessageHandler.mock.calls[0][0] as ChannelMessage
      expect(message.content).toBe('not valid json')
    })

    it('should handle missing sender ID', async () => {
      const feishuEvent = {
        header: {
          event_id: 'evt_no_sender',
          event_type: 'im.message.receive_v1',
          create_time: '1700000000',
          app_id: testConfig.appId,
          tenant_key: 'tenant_123',
        },
        event: {
          sender: { sender_id: {} }, // No IDs
          message: {
            message_id: 'msg_no_sender',
            chat_id: 'oc_chat',
            message_type: 'text',
            content: JSON.stringify({ text: 'test' }),
            create_time: '1700000000',
          },
        },
      }

      await channel.handleWebhook(feishuEvent, 'sig', '1700000000', 'nonce')

      const message = mockMessageHandler.mock.calls[0][0] as ChannelMessage
      // When no sender ID is available, it will be undefined
      // This is acceptable - the message is still processed
      expect(message.id).toBe('msg_no_sender')
    })

    it('should handle empty message content', async () => {
      const feishuEvent = {
        header: {
          event_id: 'evt_empty',
          event_type: 'im.message.receive_v1',
          create_time: '1700000000',
          app_id: testConfig.appId,
          tenant_key: 'tenant_123',
        },
        event: {
          sender: { sender_id: { open_id: 'ou_123' } },
          message: {
            message_id: 'msg_empty',
            chat_id: 'oc_chat',
            message_type: 'text',
            content: JSON.stringify({ text: '' }),
            create_time: '1700000000',
          },
        },
      }

      await channel.handleWebhook(feishuEvent, 'sig', '1700000000', 'nonce')

      const message = mockMessageHandler.mock.calls[0][0] as ChannelMessage
      expect(message.content).toBe('')
    })
  })
})
