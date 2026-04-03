/**
 * @bundy-lmw/hive-plugin-feishu - File Handling Unit Tests
 *
 * 测试文件上传、下载、发送和接收功能。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ILogger } from '@bundy-lmw/hive-core'

// Mock lark SDK
const {
  mockMessageCreate,
  mockMessageReply,
  mockFileCreate,
  mockImageCreate,
  mockFileGet,
  mockImageGet,
} = vi.hoisted(() => {
  const mockMessageCreate = vi.fn().mockResolvedValue({
    code: 0,
    msg: 'success',
    data: { message_id: 'msg_file_123' },
  })
  const mockMessageReply = vi.fn().mockResolvedValue({
    code: 0,
    msg: 'success',
    data: { message_id: 'msg_reply_file_123' },
  })
  const mockFileCreate = vi.fn().mockResolvedValue({
    file_key: 'file_key_abc',
  })
  const mockImageCreate = vi.fn().mockResolvedValue({
    image_key: 'image_key_xyz',
  })
  const mockWriteFile = vi.fn().mockResolvedValue(undefined)
  const mockFileGet = vi.fn().mockResolvedValue({
    writeFile: mockWriteFile,
  })
  const mockImageGet = vi.fn().mockResolvedValue({
    writeFile: mockWriteFile,
  })
  return {
    mockMessageCreate,
    mockMessageReply,
    mockFileCreate,
    mockImageCreate,
    mockFileGet,
    mockImageGet,
  }
})

vi.mock('@larksuiteoapi/node-sdk', () => ({
  Client: class MockClient {
    im = {
      v1: {
        message: {
          create: mockMessageCreate,
          reply: mockMessageReply,
        },
      },
      file: {
        create: mockFileCreate,
        get: mockFileGet,
      },
      image: {
        create: mockImageCreate,
        get: mockImageGet,
      },
    }
  },
  WSClient: class MockWSClient {
    start = vi.fn().mockResolvedValue(undefined)
    close = vi.fn()
  },
  EventDispatcher: class MockEventDispatcher {
    register = vi.fn().mockReturnThis()
  },
  AppType: { SelfBuild: 'SelfBuild' },
  Domain: { Feishu: 'https://open.feishu.cn' },
  LoggerLevel: { info: 'info' },
}))

vi.mock('fs', () => {
  const mockFs = {
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-file-content')),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  }
  return {
    default: mockFs,
    ...mockFs,
  }
})

vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>()
  return {
    ...actual,
    resolve: (p: string, ...args: string[]) => {
      // 简单模拟：不处理相对路径
      if (args.length > 0) return `${p}/${args.join('/')}`
      return p
    },
  }
})

// Import after mocks are set up
const { FeishuChannel } = await import('../src/channel.js')

describe('FeishuChannel File Handling', () => {
  let channel: InstanceType<typeof FeishuChannel>
  let mockMessageHandler: ReturnType<typeof vi.fn>
  let mockLogger: ILogger

  const testConfig = {
    appId: 'cli_test_file',
    appSecret: 'test_secret_file',
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockMessageHandler = vi.fn()

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    channel = new FeishuChannel(testConfig, mockMessageHandler, mockLogger, '/tmp/test-workspace')
  })

  // ============================
  // 5.1 文件上传测试
  // ============================

  describe('uploadFile', () => {
    it('should upload a file and return file_key', async () => {
      mockFileCreate.mockResolvedValue({ file_key: 'fk_001' })

      // 通过 send() 间接测试 uploadFile
      const result = await channel.send({
        to: 'chat_123',
        type: 'file',
        content: '',
        metadata: { filePath: '/path/to/report.pdf' },
      })

      expect(mockFileCreate).toHaveBeenCalled()
      expect(mockMessageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            msg_type: 'file',
            content: JSON.stringify({ file_key: 'fk_001' }),
          }),
        }),
      )
      expect(result.success).toBe(true)
      expect(result.messageId).toBe('msg_file_123')
    })

    it('should return error when file does not exist', async () => {
      const fs = await import('fs')
      // channel.ts uses `import fs from 'fs'` so existsSync is on default
      vi.spyOn(fs.default, 'existsSync').mockReturnValueOnce(false)

      const result = await channel.send({
        to: 'chat_123',
        type: 'file',
        content: '',
        metadata: { filePath: '/path/to/missing.pdf' },
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('File not found')
      expect(mockFileCreate).not.toHaveBeenCalled()
    })

    it('should return error when upload fails', async () => {
      mockFileCreate.mockResolvedValue(null)

      const result = await channel.send({
        to: 'chat_123',
        type: 'file',
        content: '',
        metadata: { filePath: '/path/to/report.pdf' },
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('no file_key returned')
    })
  })

  describe('uploadImage', () => {
    it('should upload an image and send image message', async () => {
      mockImageCreate.mockResolvedValue({ image_key: 'ik_001' })

      const result = await channel.send({
        to: 'chat_123',
        type: 'image',
        content: '',
        metadata: { filePath: '/path/to/photo.png' },
      })

      expect(mockImageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ image_type: 'message' }),
        }),
      )
      expect(mockMessageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            msg_type: 'image',
            content: JSON.stringify({ image_key: 'ik_001' }),
          }),
        }),
      )
      expect(result.success).toBe(true)
    })

    it('should return error when image upload fails', async () => {
      mockImageCreate.mockResolvedValue(null)

      const result = await channel.send({
        to: 'chat_123',
        type: 'image',
        content: '',
        metadata: { filePath: '/path/to/photo.png' },
      })

      expect(result.success).toBe(false)
    })
  })

  // ============================
  // 5.2 文件下载测试
  // ============================

  describe('downloadFile', () => {
    it('should download file and return local path', async () => {
      const mockWriteFile = vi.fn().mockResolvedValue(undefined)
      mockFileGet.mockResolvedValue({ writeFile: mockWriteFile })

      // 通过内部方法间接测试 downloadFile
      // 触发接收文件消息来测试下载流程
      const eventData = {
        sender: {
          sender_id: { open_id: 'ou_123', user_id: 'uid_123' },
        },
        message: {
          message_id: 'msg_recv_file',
          message_type: 'file',
          content: JSON.stringify({ file_key: 'fk_download', file_name: 'doc.pdf' }),
          chat_id: 'chat_456',
          create_time: '1700000000',
        },
      }

      // 需要通过事件处理器触发
      await (channel as unknown as { handleWSMessageEvent: (data: unknown) => Promise<void> }).handleWSMessageEvent(eventData)

      expect(mockFileGet).toHaveBeenCalledWith({
        path: { file_key: 'fk_download' },
      })
      expect(mockWriteFile).toHaveBeenCalled()
      expect(mockMessageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file',
        }),
      )
    })

    it('should handle download failure gracefully', async () => {
      mockFileGet.mockRejectedValue(new Error('Network error'))

      const eventData = {
        sender: {
          sender_id: { open_id: 'ou_123', user_id: 'uid_123' },
        },
        message: {
          message_id: 'msg_recv_fail',
          message_type: 'file',
          content: JSON.stringify({ file_key: 'fk_fail', file_name: 'broken.pdf' }),
          chat_id: 'chat_456',
          create_time: '1700000000',
        },
      }

      await (channel as unknown as { handleWSMessageEvent: (data: unknown) => Promise<void> }).handleWSMessageEvent(eventData)

      expect(mockLogger.error).toHaveBeenCalled()
      // 消息仍应发布（降级处理）
      expect(mockMessageHandler).toHaveBeenCalled()
    })
  })

  describe('downloadImage', () => {
    it('should download image on receive', async () => {
      const mockWriteFile = vi.fn().mockResolvedValue(undefined)
      mockImageGet.mockResolvedValue({ writeFile: mockWriteFile })

      const eventData = {
        sender: {
          sender_id: { open_id: 'ou_123', user_id: 'uid_123' },
        },
        message: {
          message_id: 'msg_recv_img',
          message_type: 'image',
          content: JSON.stringify({ image_key: 'ik_download' }),
          chat_id: 'chat_456',
          create_time: '1700000000',
        },
      }

      await (channel as unknown as { handleWSMessageEvent: (data: unknown) => Promise<void> }).handleWSMessageEvent(eventData)

      expect(mockImageGet).toHaveBeenCalledWith({
        path: { image_key: 'ik_download' },
      })
      expect(mockWriteFile).toHaveBeenCalled()
    })
  })

  // ============================
  // 5.3 send() file/image 分支测试
  // ============================

  describe('send() file/image branch', () => {
    it('should fall through to text when type is text', async () => {
      const result = await channel.send({
        to: 'chat_123',
        type: 'text',
        content: 'hello',
      })

      expect(result.success).toBe(true)
      expect(mockFileCreate).not.toHaveBeenCalled()
      expect(mockImageCreate).not.toHaveBeenCalled()
      expect(mockMessageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            msg_type: 'text',
          }),
        }),
      )
    })

    it('should auto-detect image type from file extension', async () => {
      mockImageCreate.mockResolvedValue({ image_key: 'ik_auto' })

      await channel.send({
        to: 'chat_123',
        content: '',
        metadata: { filePath: '/path/to/photo.jpg' },
      })

      expect(mockImageCreate).toHaveBeenCalled()
      expect(mockFileCreate).not.toHaveBeenCalled()
    })
  })

  // ============================
  // 5.4 消息接收文件下载分支测试
  // ============================

  describe('receive file message types', () => {
    it('should handle audio message type as file', async () => {
      const mockWriteFile = vi.fn().mockResolvedValue(undefined)
      mockFileGet.mockResolvedValue({ writeFile: mockWriteFile })

      const eventData = {
        sender: {
          sender_id: { open_id: 'ou_123', user_id: 'uid_123' },
        },
        message: {
          message_id: 'msg_audio',
          message_type: 'audio',
          content: JSON.stringify({ file_key: 'fk_audio', file_name: 'voice.mp3' }),
          chat_id: 'chat_456',
          create_time: '1700000000',
        },
      }

      await (channel as unknown as { handleWSMessageEvent: (data: unknown) => Promise<void> }).handleWSMessageEvent(eventData)

      expect(mockFileGet).toHaveBeenCalled()
      expect(mockMessageHandler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'file' }),
      )
    })

    it('should handle media message type as file', async () => {
      const mockWriteFile = vi.fn().mockResolvedValue(undefined)
      mockFileGet.mockResolvedValue({ writeFile: mockWriteFile })

      const eventData = {
        sender: {
          sender_id: { open_id: 'ou_123', user_id: 'uid_123' },
        },
        message: {
          message_id: 'msg_media',
          message_type: 'media',
          content: JSON.stringify({ file_key: 'fk_media', file_name: 'video.mp4' }),
          chat_id: 'chat_456',
          create_time: '1700000000',
        },
      }

      await (channel as unknown as { handleWSMessageEvent: (data: unknown) => Promise<void> }).handleWSMessageEvent(eventData)

      expect(mockFileGet).toHaveBeenCalled()
    })

    it('should still handle text messages normally', async () => {
      const eventData = {
        sender: {
          sender_id: { open_id: 'ou_123', user_id: 'uid_123' },
        },
        message: {
          message_id: 'msg_text',
          message_type: 'text',
          content: JSON.stringify({ text: 'hello world' }),
          chat_id: 'chat_456',
          create_time: '1700000000',
        },
      }

      await (channel as unknown as { handleWSMessageEvent: (data: unknown) => Promise<void> }).handleWSMessageEvent(eventData)

      expect(mockFileGet).not.toHaveBeenCalled()
      expect(mockImageGet).not.toHaveBeenCalled()
      expect(mockMessageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'text',
          content: 'hello world',
        }),
      )
    })
  })

  // ============================
  // reply() 文件/图片分支测试
  // ============================

  describe('reply() file/image', () => {
    it('should reply with file', async () => {
      mockFileCreate.mockResolvedValue({ file_key: 'fk_reply' })

      const result = await channel.reply('msg_original', {
        to: 'chat_123',
        type: 'file',
        content: '',
        metadata: { filePath: '/path/to/doc.pdf' },
      })

      expect(mockFileCreate).toHaveBeenCalled()
      expect(mockMessageReply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            msg_type: 'file',
            content: JSON.stringify({ file_key: 'fk_reply' }),
          }),
        }),
      )
      expect(result.success).toBe(true)
    })

    it('should reply with image', async () => {
      mockImageCreate.mockResolvedValue({ image_key: 'ik_reply' })

      const result = await channel.reply('msg_original', {
        to: 'chat_123',
        type: 'image',
        content: '',
        metadata: { filePath: '/path/to/img.png' },
      })

      expect(mockImageCreate).toHaveBeenCalled()
      expect(mockMessageReply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            msg_type: 'image',
            content: JSON.stringify({ image_key: 'ik_reply' }),
          }),
        }),
      )
      expect(result.success).toBe(true)
    })
  })

  // ============================
  // ChannelSendOptions.filePath 一等字段测试
  // ============================

  describe('options.filePath (first-class field)', () => {
    it('should send file using options.filePath instead of metadata.filePath', async () => {
      mockFileCreate.mockResolvedValue({ file_key: 'fk_direct' })

      const result = await channel.send({
        to: 'chat_123',
        type: 'file',
        content: '',
        filePath: '/path/to/direct-report.pdf',
      })

      expect(mockFileCreate).toHaveBeenCalled()
      expect(mockMessageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            msg_type: 'file',
            content: JSON.stringify({ file_key: 'fk_direct' }),
          }),
        }),
      )
      expect(result.success).toBe(true)
    })

    it('should fall back to metadata.filePath when options.filePath is not set', async () => {
      mockFileCreate.mockResolvedValue({ file_key: 'fk_fallback' })

      const result = await channel.send({
        to: 'chat_123',
        type: 'file',
        content: '',
        metadata: { filePath: '/path/to/fallback.pdf' },
      })

      expect(mockFileCreate).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should prefer options.filePath over metadata.filePath', async () => {
      mockFileCreate.mockResolvedValue({ file_key: 'fk_preferred' })

      const result = await channel.send({
        to: 'chat_123',
        type: 'file',
        content: '',
        filePath: '/path/to/preferred.pdf',
        metadata: { filePath: '/path/to/ignored.pdf' },
      })

      expect(result.success).toBe(true)
    })

    it('should reply with file using options.filePath', async () => {
      mockFileCreate.mockResolvedValue({ file_key: 'fk_reply_direct' })

      const result = await channel.reply('msg_original', {
        to: 'chat_123',
        type: 'file',
        content: '',
        filePath: '/path/to/reply-doc.pdf',
      })

      expect(mockFileCreate).toHaveBeenCalled()
      expect(mockMessageReply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            msg_type: 'file',
            content: JSON.stringify({ file_key: 'fk_reply_direct' }),
          }),
        }),
      )
      expect(result.success).toBe(true)
    })
  })
})
