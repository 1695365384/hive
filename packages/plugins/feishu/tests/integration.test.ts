/**
 * @bundy-lmw/hive-plugin-feishu - Integration Tests
 *
 * 测试插件与 Hive 核心的集成，包括：
 * - 插件生命周期
 * - 多租户配置
 * - 完整的 Webhook 处理流程
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FeishuPlugin } from '../src/plugin.js'
import { FeishuChannel } from '../src/channel.js'
import type { IMessageBus, ILogger, IChannel } from '@bundy-lmw/hive-core'

// Mock lark SDK - use vi.hoisted for proper hoisting
const { mockCreate, mockReply } = vi.hoisted(() => {
  const mockCreate = vi.fn().mockResolvedValue({
    code: 0,
    msg: 'success',
    data: { message_id: 'msg_integration_123' },
  })
  const mockReply = vi.fn().mockResolvedValue({
    code: 0,
    msg: 'success',
    data: { message_id: 'msg_integration_456' },
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

describe('FeishuPlugin Integration', () => {
  let plugin: FeishuPlugin
  let mockMessageBus: IMessageBus
  let mockLogger: ILogger

  const multiTenantConfig = {
    apps: [
      {
        appId: 'cli_tenant1',
        appSecret: 'secret_tenant1',
        // 移除 encryptKey 以跳过签名验证
        verificationToken: 'token_tenant1',
      },
      {
        appId: 'cli_tenant2',
        appSecret: 'secret_tenant2',
        // Optional fields omitted
      },
    ],
  }

  beforeEach(() => {
    mockMessageBus = {
      emit: vi.fn(),
      subscribe: vi.fn().mockReturnValue('sub_integration'),
      unsubscribe: vi.fn(),
      publish: vi.fn(),
    }

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    plugin = new FeishuPlugin(multiTenantConfig)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Plugin Lifecycle', () => {
    it('should initialize with multi-tenant config', async () => {
      const registerChannel = vi.fn()
      await plugin.initialize(mockMessageBus, mockLogger, registerChannel)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[FeishuPlugin] Initializing')
      )
      expect(registerChannel).toHaveBeenCalledTimes(2)
    })

    it('should activate all channels', async () => {
      const registerChannel = vi.fn()
      await plugin.initialize(mockMessageBus, mockLogger, registerChannel)
      await plugin.activate()

      const channels = plugin.getChannels()
      expect(channels).toHaveLength(2)
      expect(channels[0].appId).toBe('cli_tenant1')
      expect(channels[1].appId).toBe('cli_tenant2')
    })

    it('should deactivate all channels', async () => {
      const registerChannel = vi.fn()
      await plugin.initialize(mockMessageBus, mockLogger, registerChannel)
      await plugin.activate()

      await plugin.deactivate()

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[FeishuPlugin] Deactivating')
      )
    })

    it('should destroy plugin cleanly', async () => {
      const registerChannel = vi.fn()
      await plugin.initialize(mockMessageBus, mockLogger, registerChannel)
      await plugin.activate()

      await plugin.destroy()

      expect(plugin.getChannels()).toHaveLength(0)
    })
  })

  describe('Multi-tenant Channel Management', () => {
    beforeEach(async () => {
      const registerChannel = vi.fn()
      await plugin.initialize(mockMessageBus, mockLogger, registerChannel)
      await plugin.activate()
    })

    it('should create channel for each tenant', () => {
      const channels = plugin.getChannels()

      expect(channels).toHaveLength(2)
      expect(channels.map((c) => c.appId)).toEqual(['cli_tenant1', 'cli_tenant2'])
    })

    it('should have correct channel IDs', () => {
      const channels = plugin.getChannels()

      expect(channels[0].id).toBe('feishu:cli_tenant1')
      expect(channels[1].id).toBe('feishu:cli_tenant2')
    })

    it('should have consistent capabilities across channels', () => {
      const channels = plugin.getChannels()

      for (const channel of channels) {
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
      }
    })

    it('should get channel by appId', () => {
      const channel = plugin.getChannelByAppId('cli_tenant1')

      expect(channel).toBeDefined()
      expect(channel?.appId).toBe('cli_tenant1')
    })

    it('should return undefined for unknown appId', () => {
      const channel = plugin.getChannelByAppId('unknown_app')

      expect(channel).toBeUndefined()
    })
  })

  describe('Webhook Event Flow', () => {
    let channel: IChannel & { appId: string; handleWebhook: any }

    beforeEach(async () => {
      const registerChannel = vi.fn()
      await plugin.initialize(mockMessageBus, mockLogger, registerChannel)
      await plugin.activate()
      channel = plugin.getChannelByAppId('cli_tenant1') as IChannel & { appId: string; handleWebhook: any }
    })

    it('should handle challenge request', async () => {
      const challengeBody = {
        type: 'url_verification',
        challenge: 'challenge_test_123',
        token: 'token_tenant1',
      }

      const result = await channel.handleWebhook(
        challengeBody,
        'signature',
        Date.now().toString(),
        'nonce'
      )

      expect(result).toEqual({ challenge: 'challenge_test_123' })
    })

    it('should emit message event to MessageBus', async () => {
      const messageEvent = {
        header: {
          event_id: 'evt_integration_001',
          event_type: 'im.message.receive_v1',
          create_time: '1700000000',
          app_id: 'cli_tenant1',
          tenant_key: 'tenant_001',
        },
        event: {
          sender: {
            sender_id: { open_id: 'ou_integration_user' },
          },
          message: {
            message_id: 'msg_integration_001',
            chat_id: 'oc_integration_chat',
            message_type: 'text',
            content: JSON.stringify({ text: 'Integration test message' }),
            create_time: '1700000000',
          },
        },
      }

      await channel.handleWebhook(messageEvent, 'sig', Date.now().toString(), 'nonce')

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        'channel:feishu:cli_tenant1:message:received',
        expect.objectContaining({
          id: 'msg_integration_001',
          content: 'Integration test message',
          type: 'text',
        })
      )
    })

    it('should handle multiple messages in sequence', async () => {
      const createEvent = (id: string, content: string) => ({
        header: {
          event_id: `evt_${id}`,
          event_type: 'im.message.receive_v1',
          create_time: '1700000000',
          app_id: 'cli_tenant1',
          tenant_key: 'tenant_001',
        },
        event: {
          sender: { sender_id: { open_id: 'ou_user' } },
          message: {
            message_id: `msg_${id}`,
            chat_id: 'oc_chat',
            message_type: 'text',
            content: JSON.stringify({ text: content }),
            create_time: '1700000000',
          },
        },
      })

      await channel.handleWebhook(createEvent('001', 'Message 1'), 'sig', '1700000000', 'n1')
      await channel.handleWebhook(createEvent('002', 'Message 2'), 'sig', '1700000000', 'n2')
      await channel.handleWebhook(createEvent('003', 'Message 3'), 'sig', '1700000000', 'n3')

      expect(mockMessageBus.publish).toHaveBeenCalledTimes(3)
    })
  })

  describe('Send Message Integration', () => {
    let channel: IChannel & { appId: string }

    beforeEach(async () => {
      const registerChannel = vi.fn()
      await plugin.initialize(mockMessageBus, mockLogger, registerChannel)
      await plugin.activate()
      channel = plugin.getChannelByAppId('cli_tenant1') as IChannel & { appId: string }
    })

    it('should send text message through channel', async () => {
      const result = await channel.send({
        to: 'oc_integration_chat',
        content: 'Hello from integration test',
        type: 'text',
      })

      expect(result.success).toBe(true)
      expect(result.messageId).toBe('msg_integration_123')
    })

    it('should reply to message through channel', async () => {
      const result = await channel.reply?.('msg_original', {
        to: 'oc_integration_chat',
        content: 'Reply from integration test',
        type: 'text',
      })

      expect(result?.success).toBe(true)
      expect(result?.messageId).toBe('msg_integration_456')
    })
  })

  describe('Error Handling', () => {
    it('should throw on invalid config in constructor', () => {
      expect(() => new FeishuPlugin({ apps: [] })).toThrow('at least one app')
    })

    it('should throw on missing apps array in constructor', () => {
      expect(() => new FeishuPlugin({})).toThrow('requires "apps" array')
    })

    it('should handle channel send failure gracefully', async () => {
      // Mock failure - use mockResolvedValueOnce to override default mock
      mockCreate.mockResolvedValueOnce({
        code: 1001,
        msg: 'Permission denied',
      })

      const registerChannel = vi.fn()
      await plugin.initialize(mockMessageBus, mockLogger, registerChannel)
      await plugin.activate()
      const channel = plugin.getChannelByAppId('cli_tenant1')

      const result = await channel!.send({
        to: 'oc_chat',
        content: 'test',
        type: 'text',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Permission denied')
    })
  })

  describe('Plugin Metadata', () => {
    it('should have correct metadata', () => {
      expect(plugin.metadata.id).toBe('feishu')
      expect(plugin.metadata.name).toBe('Feishu Plugin')
      expect(plugin.metadata.version).toBe('1.0.0')
    })
  })
})

describe('FeishuChannel + MessageBus Integration', () => {
  let channel: FeishuChannel
  let messageBus: IMessageBus
  let logger: ILogger
  let emittedMessages: any[] = []

  beforeEach(() => {
    emittedMessages = []

    messageBus = {
      emit: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      publish: vi.fn((event, message) => {
        emittedMessages.push({ event, message })
      }),
    }

    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    channel = new FeishuChannel(
      {
        appId: 'cli_integration',
        appSecret: 'secret',
      },
      messageBus,
      logger
    )
  })

  it('should emit correctly formatted messages to MessageBus', async () => {
    const event = {
      header: {
        event_id: 'evt_full_integration',
        event_type: 'im.message.receive_v1',
        create_time: '1700000000',
        app_id: 'cli_integration',
        tenant_key: 'tenant_full',
      },
      event: {
        sender: {
          sender_id: { open_id: 'ou_sender' },
          sender_type: 'app',
        },
        message: {
          message_id: 'msg_full',
          chat_id: 'oc_group',
          message_type: 'text',
          content: JSON.stringify({ text: 'Full integration test' }),
          create_time: '1700000000',
        },
      },
    }

    await channel.handleWebhook(event, 'sig', '1700000000', 'nonce')

    expect(emittedMessages).toHaveLength(1)
    expect(emittedMessages[0].event).toBe('channel:feishu:cli_integration:message:received')
    expect(emittedMessages[0].message).toMatchObject({
      id: 'msg_full',
      content: 'Full integration test',
      type: 'text',
      from: {
        id: 'ou_sender',
        type: 'user',
      },
      to: {
        id: 'oc_group',
        type: 'group',
      },
    })
  })

  it('should preserve raw event in emitted message', async () => {
    const event = {
      header: {
        event_id: 'evt_raw_test',
        event_type: 'im.message.receive_v1',
        create_time: '1700000000',
        app_id: 'cli_integration',
        tenant_key: 'tenant_raw',
      },
      event: {
        sender: { sender_id: { open_id: 'ou_raw' } },
        message: {
          message_id: 'msg_raw',
          chat_id: 'oc_raw',
          message_type: 'text',
          content: JSON.stringify({ text: 'raw test' }),
          create_time: '1700000000',
        },
      },
    }

    await channel.handleWebhook(event, 'sig', '1700000000', 'nonce')

    expect(emittedMessages[0].message.raw).toEqual(event)
  })
})
