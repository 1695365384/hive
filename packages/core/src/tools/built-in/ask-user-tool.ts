/**
 * Ask User 工具 — 向用户提问
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 通过 ToolRegistry 注册的回调函数获取用户回答。
 */

import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolResult } from '../harness/types.js';
import { withHarness } from '../harness/with-harness.js';
import type { RawTool } from '../harness/with-harness.js';

/** 用户提问回调函数类型 */
export type AskUserCallback = (question: string, options?: Array<{ label: string; description?: string }>) => Promise<string>;

/** 全局回调（由 ToolRegistry 注入） */
let askUserCallback: AskUserCallback | null = null;

/**
 * 设置用户提问回调
 */
export function setAskUserCallback(cb: AskUserCallback): void {
  askUserCallback = cb;
}

/** Ask User 工具输入 schema */
const askUserInputSchema = z.object({
  question: z.string().describe('The question to ask the user'),
  options: z.array(
    z.object({
      label: z.string().describe('Option label'),
      description: z.string().optional().describe('Detailed description of the option'),
    }),
  ).optional().describe('Optional list of choices for the user to select from'),
});

export type AskUserToolInput = z.infer<typeof askUserInputSchema>;

/** 创建原始工具（execute → ToolResult，不经 harness） */
export function createRawAskUserTool(): RawTool<AskUserToolInput> {
  return {
    description: 'Ask the user a question to get clarification or let them make a choice. Use when you need user input to proceed.',
    inputSchema: zodSchema(askUserInputSchema),
    execute: async ({ question, options }): Promise<ToolResult> => {
      if (!askUserCallback) {
        return { ok: false, code: 'PERMISSION', error: 'No callback registered, cannot ask user', context: { reason: 'No callback registered' } };
      }

      try {
        const answer = await askUserCallback(question, options);
        return { ok: true, code: 'OK', data: answer };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, code: 'EXEC_ERROR', error: `Failed to get user response: ${msg}` };
      }
    },
  };
}

/**
 * 创建 Ask User 工具（AI SDK 兼容，execute → string）
 *
 * 内部使用 withHarness 包装 rawTool 逻辑。
 */
export function createAskUserTool(): Tool<AskUserToolInput, string> {
  return withHarness(createRawAskUserTool(), { toolName: 'ask-user-tool' });
}

export const askUserTool = createAskUserTool();
