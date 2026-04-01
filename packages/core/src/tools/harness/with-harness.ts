/**
 * withHarness — 工具包装高阶函数
 *
 * 在 rawTool（execute → ToolResult）和 AI SDK tool（execute → string）之间
 * 提供 retry + hint injection + serialize + 异常兜底。
 */

import { tool, type Tool } from 'ai';
import type { ToolResult, HarnessConfig, HintTemplateMap } from './types.js';
import { retryWithBackoff } from './retry.js';
import { serializeToolResult } from './serializer.js';
import { getAllHintTemplates, getToolHintTemplates } from './hint-registry.js';

/**
 * RawTool 类型 — execute 返回 ToolResult
 */
export interface RawTool<TInput = any> {
  description?: string;
  /** @see ai.zodSchema — 直接传 zodSchema(z) 的返回值 */
  inputSchema?: any;
  execute: (input: TInput, options: any) => Promise<ToolResult>;
}

/**
 * 用 harness 包装 rawTool
 *
 * @param rawTool - 内层工具（execute → ToolResult）
 * @param config - harness 配置
 * @returns AI SDK 兼容的 tool（execute → string）
 */
export function withHarness<TInput = any>(
  rawTool: RawTool<TInput>,
  config?: HarnessConfig,
): Tool<TInput, string> {
  // 合并 hint 模板：全局 < 工具级 < 自定义
  const toolTemplates = config?.toolName ? getToolHintTemplates(config.toolName) : {};
  const mergedTemplates: HintTemplateMap = {
    ...getAllHintTemplates(),
    ...toolTemplates,
    ...config?.hintTemplates,
  };

  const wrappedExecute = async (input: TInput, options: any): Promise<string> => {
    try {
      // 1. 执行工具获取 ToolResult
      let result = await retryWithBackoff(
        () => rawTool.execute(input, options),
        { maxRetries: config?.maxRetries, baseDelay: config?.baseDelay },
      );

      // 2. 序列化为 string（内部处理 hint injection）
      return serializeToolResult(result, mergedTemplates, config?.toolName);
    } catch (error) {
      // 3. 异常兜底 — 确保永远返回 string
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[harness] 工具内部异常:', error);
      return `[Error] 工具内部异常: ${msg}`;
    }
  };

  return tool({
    description: rawTool.description ?? '',
    inputSchema: rawTool.inputSchema,
    execute: wrappedExecute,
  } as any);
}
