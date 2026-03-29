/**
 * Send File 工具 — 将本地文件发送给当前会话用户
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 通过 ToolRegistry 注入的回调函数执行发送。
 */

import { tool, zodSchema, type Tool } from 'ai'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'

/** 发送文件回调函数类型 */
export type SendFileCallback = (filePath: string) => Promise<{ success: boolean; error?: string }>

/** 全局回调（由 ToolRegistry 注入） */
let sendFileCallback: SendFileCallback | null = null

/**
 * 设置发送文件回调
 */
export function setSendFileCallback(cb: SendFileCallback): void {
  sendFileCallback = cb
}

/** 图片扩展名 */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

/** Send File 工具输入 schema */
const sendFileInputSchema = z.object({
  filePath: z.string().describe('要发送的本地文件路径（绝对路径或相对于工作目录的路径）'),
  description: z.string().optional().describe('文件描述，会作为发送消息的附言'),
})

export type SendFileToolInput = z.infer<typeof sendFileInputSchema>

/**
 * 创建 Send File 工具
 */
export function createSendFileTool(): Tool<SendFileToolInput, string> {
  return tool({
    description: '将本地文件发送给当前会话的用户。支持文件和图片。适用于：用户要求发送文件、分享生成的报告、转发下载的资源等场景。',
    inputSchema: zodSchema(sendFileInputSchema),
    execute: async ({ filePath, description }): Promise<string> => {
      if (!sendFileCallback) {
        return '[send_file] 当前环境不支持文件发送。仅在通过消息通道（如飞书）接入时可用。'
      }

      const absolutePath = path.resolve(filePath)

      // 检查文件是否存在
      if (!fs.existsSync(absolutePath)) {
        return `[Error] 文件不存在: ${absolutePath}`
      }

      // 检查是否为目录
      const stat = fs.statSync(absolutePath)
      if (stat.isDirectory()) {
        return `[Error] 不能发送目录: ${absolutePath}`
      }

      try {
        const result = await sendFileCallback(absolutePath)
        if (!result.success) {
          return `[Error] 文件发送失败: ${result.error || '未知错误'}`
        }

        const ext = path.extname(absolutePath).toLowerCase()
        const fileType = IMAGE_EXTENSIONS.has(ext) ? '图片' : '文件'
        const fileName = path.basename(absolutePath)
        const descriptionText = description ? `\n${description}` : ''

        return `已发送${fileType}: ${fileName}${descriptionText}`
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        return `[Error] 文件发送失败: ${msg}`
      }
    },
  })
}

export const sendFileTool = createSendFileTool()
