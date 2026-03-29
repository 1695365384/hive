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
  question: z.string().describe('Question to ask the user'),
  options: z.array(
    z.object({
      label: z.string().describe('Option label'),
      description: z.string().optional().describe('Option description'),
    }),
  ).optional().describe('Optional list of choices for the user'),
});

export type AskUserToolInput = z.infer<typeof askUserInputSchema>;

/**
 * 创建 Ask User 工具
 */
export function createAskUserTool(): Tool<AskUserToolInput, string> {
  return tool({
    description: 'Ask the user a question to get clarification or let them make a choice. Use when user input is needed to proceed.',
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
