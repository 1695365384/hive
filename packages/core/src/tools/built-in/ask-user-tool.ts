/**
 * Ask User 工具 — 向用户提问
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 通过 ToolRegistry 注册的回调函数获取用户回答。
 */

import { tool, zodSchema, type Tool } from 'ai';
import { z } from 'zod';

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
 * 创建 Ask User 工具
 */
export function createAskUserTool(): Tool<AskUserToolInput, string> {
  return tool({
    description: '向用户提出问题以获取澄清信息或让用户做选择。适用于需要用户输入才能继续的场景。',
    inputSchema: zodSchema(askUserInputSchema),
    execute: async ({ question, options }): Promise<string> => {
      if (!askUserCallback) {
        return '[ask-user] 无回调注册，无法向用户提问。请确保通过 ToolRegistry 注册了回调函数。';
      }

      try {
        const answer = await askUserCallback(question, options);
        return answer;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return `[Error] 获取用户回答失败: ${msg}`;
      }
    },
  });
}

export const askUserTool = createAskUserTool();
