/**
 * Remember 工具 — 让 Agent 显式保存信息到记忆文件
 *
 * Agent 调用此工具来记住关于用户的重要信息（偏好、事实、上下文等）。
 * 内容会追加到当前用户的记忆文件中。
 *
 * 遵循 ask-user-tool.ts 的模式：
 * 1. RawTool → withHarness 包装
 * 2. 全局回调注入（由 ToolRegistry / ServerImpl 设置）
 */

import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolResult } from '../harness/types.js';
import { withHarness } from '../harness/with-harness.js';
import type { RawTool } from '../harness/with-harness.js';

/** remember 回调：将内容写入记忆 */
export type RememberCallback = (content: string) => Promise<void>;

/** 全局回调 */
let rememberCallback: RememberCallback | null = null;

/**
 * 设置 remember 回调
 */
export function setRememberCallback(cb: RememberCallback): void {
  rememberCallback = cb;
}

/** remember 工具输入 schema */
const rememberInputSchema = z.object({
  content: z.string().describe('Information to remember about the user or conversation context'),
});

export type RememberToolInput = z.infer<typeof rememberInputSchema>;

/** 创建原始工具 */
export function createRawRememberTool(): RawTool<RememberToolInput> {
  return {
    description: 'Save important information about the user or conversation context to memory. ' +
      'Use this when you learn something about the user (preferences, facts, decisions) that should be remembered ' +
      'across conversations. Content is appended to the user\'s persistent memory file.',
    inputSchema: zodSchema(rememberInputSchema),
    execute: async ({ content }): Promise<ToolResult> => {
      if (!rememberCallback) {
        return { ok: false, code: 'PERMISSION', error: 'No memory callback registered', context: { reason: 'No callback registered' } };
      }

      try {
        await rememberCallback(content);
        return { ok: true, code: 'OK', data: 'Information saved to memory.' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, code: 'EXEC_ERROR', error: `Failed to save to memory: ${msg}` };
      }
    },
  };
}

/**
 * 创建 Remember 工具（AI SDK 兼容）
 */
export function createRememberTool(): Tool<RememberToolInput, string> {
  return withHarness(createRawRememberTool(), { toolName: 'remember-tool' });
}

export const rememberTool = createRememberTool();
