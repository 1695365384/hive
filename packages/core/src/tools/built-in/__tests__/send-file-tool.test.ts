/**
 * send-file-tool Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fs before importing the tool
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => false }),
  },
  existsSync: vi.fn().mockReturnValue(true),
  statSync: vi.fn().mockReturnValue({ isDirectory: () => false }),
}))

vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>()
  return {
    ...actual,
    resolve: (p: string) => p,
  }
})

// hoist the mock callback
const { mockSendFileCb } = vi.hoisted(() => ({
  mockSendFileCb: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('../send-file-tool.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../send-file-tool.js')>()
  return {
    ...actual,
    // We'll set the callback manually in tests via the real module
  }
})

import { createSendFileTool, setSendFileCallback } from '../send-file-tool.js'

describe('send-file-tool', () => {
  let tool: ReturnType<typeof createSendFileTool>

  beforeEach(() => {
    vi.clearAllMocks()
    tool = createSendFileTool()
  })

  it('should send file successfully when callback is registered', async () => {
    setSendFileCallback(mockSendFileCb)

    const result = await tool.execute!({
      filePath: '/tmp/report.pdf',
    })

    expect(mockSendFileCb).toHaveBeenCalledWith('/tmp/report.pdf')
    expect(result).toContain('已发送文件')
    expect(result).toContain('report.pdf')
  })

  it('should send image with correct type label', async () => {
    setSendFileCallback(mockSendFileCb)

    const result = await tool.execute!({
      filePath: '/tmp/photo.png',
    })

    expect(result).toContain('已发送图片')
  })

  it('should include description in result', async () => {
    setSendFileCallback(mockSendFileCb)

    const result = await tool.execute!({
      filePath: '/tmp/report.pdf',
      description: '本月销售报告',
    })

    expect(result).toContain('本月销售报告')
  })

  it('should return error when callback is not registered', async () => {
    setSendFileCallback(null as unknown as Parameters<typeof setSendFileCallback>[0])

    const result = await tool.execute!({
      filePath: '/tmp/report.pdf',
    })

    expect(result).toContain('当前环境不支持文件发送')
    expect(mockSendFileCb).not.toHaveBeenCalled()
  })

  it('should return error when file does not exist', async () => {
    setSendFileCallback(mockSendFileCb)
    const fs = await import('fs')
    vi.spyOn(fs.default, 'existsSync').mockReturnValueOnce(false)

    const result = await tool.execute!({
      filePath: '/tmp/missing.pdf',
    })

    expect(result).toContain('文件不存在')
    expect(mockSendFileCb).not.toHaveBeenCalled()
  })

  it('should return error when path is a directory', async () => {
    setSendFileCallback(mockSendFileCb)
    const fs = await import('fs')
    vi.spyOn(fs.default, 'statSync').mockReturnValueOnce({ isDirectory: () => true } as ReturnType<typeof fs.default.statSync>)

    const result = await tool.execute!({
      filePath: '/tmp/some-dir',
    })

    expect(result).toContain('不能发送目录')
    expect(mockSendFileCb).not.toHaveBeenCalled()
  })

  it('should return error when callback returns failure', async () => {
    setSendFileCallback(mockSendFileCb)
    mockSendFileCb.mockResolvedValueOnce({ success: false, error: 'API rate limit' })

    const result = await tool.execute!({
      filePath: '/tmp/report.pdf',
    })

    expect(result).toContain('文件发送失败')
    expect(result).toContain('API rate limit')
  })

  it('should return error when callback throws', async () => {
    setSendFileCallback(mockSendFileCb)
    mockSendFileCb.mockRejectedValueOnce(new Error('Network error'))

    const result = await tool.execute!({
      filePath: '/tmp/report.pdf',
    })

    expect(result).toContain('文件发送失败')
    expect(result).toContain('Network error')
  })

  it('should detect image types correctly', async () => {
    setSendFileCallback(mockSendFileCb)

    for (const ext of ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']) {
      mockSendFileCb.mockClear()
      const result = await tool.execute!({ filePath: `/tmp/photo${ext}` })
      expect(result).toContain('已发送图片')
    }
  })
})
