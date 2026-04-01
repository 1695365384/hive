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
  filePath: z.string().describe('Absolute or relative path to the local file. MUST be within the working directory; paths outside will be rejected.'),
  description: z.string().optional().describe('File description, shown as a caption when sending'),
});

export type SendFileToolInput = z.infer<typeof sendFileInputSchema>;

/**
 * 创建 Send File rawTool（execute → ToolResult）
 *
 * 供 withHarness 包装使用，也供单元测试直接验证 ToolResult。
 */
export function createRawSendFileTool(): RawTool<SendFileToolInput> {
  return {
    description: 'Send a local file to the current session user. Supports files and images. IMPORTANT: The file path MUST be within the working directory. Files outside the working directory will be rejected. If you need to send an external file, copy it into the working directory first using bash. Use cases: user requests to send a file, share a generated report, forward a downloaded resource.',
    inputSchema: zodSchema(sendFileInputSchema),
    execute: async ({ filePath, description }): Promise<ToolResult> => {
      if (!sendFileCallback) {
        return { ok: false, code: 'PERMISSION', error: 'File sending not supported in current environment. Only available when connected via a messaging channel (e.g. Feishu).', context: { reason: 'No callback registered' } };
      }

      const absolutePath = path.resolve(filePath);

      // 路径约束检查
      if (!isPathAllowed(absolutePath)) {
        return { ok: false, code: 'PATH_BLOCKED', error: `File path is outside the allowed working directory: ${absolutePath}`, context: { path: absolutePath } };
      }

      // 敏感文件检查
      const sensitive = isSensitiveFile(absolutePath, 'read');
      if (sensitive.sensitive) {
        return { ok: false, code: 'SENSITIVE_FILE', error: `Refused to send sensitive file (${sensitive.description})`, context: { description: sensitive.description } };
      }

      // 检查文件是否存在
      if (!fs.existsSync(absolutePath)) {
        return { ok: false, code: 'NOT_FOUND', error: `File not found: ${absolutePath}`, context: { path: absolutePath } };
      }

      // 检查是否为目录
      const stat = fs.statSync(absolutePath);
      if (stat.isDirectory()) {
        return { ok: false, code: 'NOT_FOUND', error: `Cannot send directory: ${absolutePath}`, context: { path: absolutePath } };
      }

      try {
        const result = await sendFileCallback(absolutePath);
        if (!result.success) {
          // 检查是否为可重试的网络错误（429/5xx/timeout，不含 400 客户端错误）
          const msg = result.error ?? 'Unknown error';
          const isRetryable = /429|5\d{2}|timeout|ECONNREFUSED|ENOTFOUND/i.test(msg);
          if (isRetryable) {
            return { ok: false, code: 'NETWORK', error: `File send failed: ${msg}`, context: { status: msg } };
          }
          return { ok: false, code: 'EXEC_ERROR', error: `File send failed: ${msg}` };
        }

        const ext = path.extname(absolutePath).toLowerCase();
        const fileType = IMAGE_EXTENSIONS.has(ext) ? 'image' : 'file';
        const fileName = path.basename(absolutePath);
        const descriptionText = description ? `\n${description}` : '';

        return { ok: true, code: 'OK', data: `Sent ${fileType}: ${fileName}${descriptionText}` };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const isNetwork = /timeout|ECONNREFUSED|ENOTFOUND/i.test(msg);
        if (isNetwork) {
          return { ok: false, code: 'NETWORK', error: `File send failed: ${msg}`, context: { status: msg } };
        }
        return { ok: false, code: 'EXEC_ERROR', error: `File send failed: ${msg}` };
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
