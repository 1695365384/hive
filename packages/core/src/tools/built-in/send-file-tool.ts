/**
 * Send File 工具 — 将本地文件发送给当前会话用户
 *
 * 通过 AI SDK tool() + Zod schema 定义。
 * 通过 ToolRegistry 注入的回调函数执行发送。
 */

import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { isPathAllowed, isSensitiveFile } from './utils/security.js';
import type { ToolResult } from '../harness/types.js';
import { withHarness, type RawTool } from '../harness/with-harness.js';

/** 发送文件回调函数类型 */
export type SendFileCallback = (filePath: string) => Promise<{ success: boolean; error?: string }>;

/** 全局回调（由 ToolRegistry 注入） */
let sendFileCallback: SendFileCallback | null = null;

/**
 * 设置发送文件回调
 */
export function setSendFileCallback(cb: SendFileCallback): void {
  sendFileCallback = cb;
}

/** 图片扩展名 */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);

/** Send File 工具输入 schema */
const sendFileInputSchema = z.object({
  filePath: z.string().describe('要发送的本地文件路径（绝对路径或相对于工作目录的路径）'),
  description: z.string().optional().describe('文件描述，会作为发送消息的附言'),
});

export type SendFileToolInput = z.infer<typeof sendFileInputSchema>;

/**
 * 创建 Send File rawTool（execute → ToolResult）
 *
 * 供 withHarness 包装使用，也供单元测试直接验证 ToolResult。
 */
export function createRawSendFileTool(): RawTool<SendFileToolInput> {
  return {
    description: '将本地文件发送给当前会话的用户。支持文件和图片。适用于：用户要求发送文件、分享生成的报告、转发下载的资源等场景。',
    inputSchema: zodSchema(sendFileInputSchema),
    execute: async ({ filePath, description }): Promise<ToolResult> => {
      if (!sendFileCallback) {
        return { ok: false, code: 'PERMISSION', error: '当前环境不支持文件发送。仅在通过消息通道（如飞书）接入时可用。', context: { reason: '无回调注册' } };
      }

      const absolutePath = path.resolve(filePath);

      // 路径约束检查
      if (!isPathAllowed(absolutePath)) {
        return { ok: false, code: 'PATH_BLOCKED', error: `文件路径不在允许的工作目录内: ${absolutePath}`, context: { path: absolutePath } };
      }

      // 敏感文件检查
      const sensitive = isSensitiveFile(absolutePath, 'read');
      if (sensitive.sensitive) {
        return { ok: false, code: 'SENSITIVE_FILE', error: `拒绝发送敏感文件（${sensitive.description}）`, context: { description: sensitive.description } };
      }

      // 检查文件是否存在
      if (!fs.existsSync(absolutePath)) {
        return { ok: false, code: 'NOT_FOUND', error: `文件不存在: ${absolutePath}`, context: { path: absolutePath } };
      }

      // 检查是否为目录
      const stat = fs.statSync(absolutePath);
      if (stat.isDirectory()) {
        return { ok: false, code: 'NOT_FOUND', error: `不能发送目录: ${absolutePath}`, context: { path: absolutePath } };
      }

      try {
        const result = await sendFileCallback(absolutePath);
        if (!result.success) {
          // 检查是否为可重试的网络错误（429/5xx/timeout，不含 400 客户端错误）
          const msg = result.error ?? '未知错误';
          const isRetryable = /429|5\d{2}|timeout|ECONNREFUSED|ENOTFOUND/i.test(msg);
          if (isRetryable) {
            return { ok: false, code: 'NETWORK', error: `文件发送失败: ${msg}`, context: { status: msg } };
          }
          return { ok: false, code: 'EXEC_ERROR', error: `文件发送失败: ${msg}` };
        }

        const ext = path.extname(absolutePath).toLowerCase();
        const fileType = IMAGE_EXTENSIONS.has(ext) ? '图片' : '文件';
        const fileName = path.basename(absolutePath);
        const descriptionText = description ? `\n${description}` : '';

        return { ok: true, code: 'OK', data: `已发送${fileType}: ${fileName}${descriptionText}` };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const isNetwork = /timeout|ECONNREFUSED|ENOTFOUND/i.test(msg);
        if (isNetwork) {
          return { ok: false, code: 'NETWORK', error: `文件发送失败: ${msg}`, context: { status: msg } };
        }
        return { ok: false, code: 'EXEC_ERROR', error: `文件发送失败: ${msg}` };
      }
    },
  };
}

/**
 * 创建 Send File 工具（AI SDK 兼容，execute → string）
 *
 * 内部使用 createRawSendFileTool + withHarness 包装。
 */
export function createSendFileTool(): Tool<SendFileToolInput, string> {
  return withHarness(createRawSendFileTool(), { maxRetries: 2, baseDelay: 500, toolName: 'send-file-tool' });
}

export const sendFileTool = createSendFileTool();
