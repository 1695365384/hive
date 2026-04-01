/**
 * Ask User 工具 — 向用户提问
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 通过 ToolRegistry 注册的回调函数获取用户回答。
 */

import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolResult } from '../harness/types.js';
import { withHarness, type RawTool } from '../harness/with-harness.js';

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
  question: z.string().describe('要向用户提出的问题'),
  options: z.array(
    z.object({
      label: z.string().describe('选项标签'),
      description: z.string().optional().describe('选项的详细描述'),
    }),
  ).optional().describe('可选的多选选项列表'),
});

export type AskUserToolInput = z.infer<typeof askUserInputSchema>;

/**
 * 创建 Ask User rawTool（execute → ToolResult）
 *
 * 供 withHarness 包装使用，也供单元测试直接验证 ToolResult。
 */
export function createRawAskUserTool(): RawTool<AskUserToolInput> {
  return {
    description: '向用户提出问题以获取澄清信息或让用户做选择。适用于需要用户输入才能继续的场景。',
    inputSchema: zodSchema(askUserInputSchema),
    execute: async ({ question, options }): Promise<ToolResult> => {
      if (!askUserCallback) {
        return { ok: false, code: 'PERMISSION', error: '无回调注册，无法向用户提问', context: { reason: '无回调注册' } };
      }

      try {
        const answer = await askUserCallback(question, options);
        return { ok: true, code: 'OK', data: answer };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, code: 'EXEC_ERROR', error: `获取用户回答失败: ${msg}` };
      }
    },
  };
}

/**
 * 创建 Ask User 工具（AI SDK 兼容，execute → string）
 *
 * 内部使用 createRawAskUserTool + withHarness 包装。
 */
export function createAskUserTool(): Tool<AskUserToolInput, string> {
  return withHarness(createRawAskUserTool(), { toolName: 'ask-user-tool' });
}

export const askUserTool = createAskUserTool();
