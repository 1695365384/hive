/**
 * withHarness — 工具包装高阶函数
 *
 * 在 rawTool（execute → ToolResult）和 AI SDK tool（execute → string）之间
 * 提供 retry + hint injection + serialize + 异常兜底 + 结果缓存。
 *
 * 缓存层（ToolCache）：
 *   - 纯函数工具（read / glob / grep 等只读工具）的结果可被缓存
 *   - 缓存 key = hash(toolName + JSON(input))
 *   - 同一 Coordinator 任务内有效（实例级缓存），任务结束时 GC
 */

import { tool, type Tool } from 'ai';
import { createHash } from 'node:crypto';
import type { ToolResult, HarnessConfig, HintTemplateMap } from './types.js';
import { retryWithBackoff } from './retry.js';
import { serializeToolResult } from './serializer.js';
import { getAllHintTemplates, getToolHintTemplates } from './hint-registry.js';

// ============================================
// 工具结果缓存
// ============================================

/** 只读工具白名单：这些工具的输出对相同输入是幂等的 */
const CACHEABLE_TOOLS = new Set(['file-tool', 'glob-tool', 'grep-tool', 'web-fetch-tool']);

/** 缓存条目 */
interface CacheEntry {
  result: string;
  createdAt: number;
}

/** 缓存 TTL（毫秒）— 同一任务会话内有效 */
const CACHE_TTL_MS = 300_000; // 5 分钟

/**
 * 工具结果缓存
 *
 * 同一 withHarness 实例内缓存只读工具的结果。
 * 对相同 (toolName, input) 的重复调用直接返回缓存结果。
 */
export class ToolCache {
  private readonly store = new Map<string, CacheEntry>();

  private static buildKey(toolName: string, input: unknown): string {
    const payload = JSON.stringify({ t: toolName, i: input });
    return createHash('sha256').update(payload).digest('hex').slice(0, 16);
  }

  get(toolName: string, input: unknown): string | null {
    if (!CACHEABLE_TOOLS.has(toolName)) return null;
    const key = ToolCache.buildKey(toolName, input);
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      this.store.delete(key);
      return null;
    }
    return entry.result;
  }

  set(toolName: string, input: unknown, result: string): void {
    if (!CACHEABLE_TOOLS.has(toolName)) return;
    const key = ToolCache.buildKey(toolName, input);
    this.store.set(key, { result, createdAt: Date.now() });
  }

  /** 清除所有缓存（任务结束时调用） */
  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

// ============================================
// withHarness
// ============================================

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
 * @param cache  - 可选的工具结果缓存实例（传入时启用缓存）
 * @returns AI SDK 兼容的 tool（execute → string）
 */
export function withHarness<TInput = any>(
  rawTool: RawTool<TInput>,
  config?: HarnessConfig,
  cache?: ToolCache,
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
      // 0. 缓存命中检查（只读工具）
      if (cache && config?.toolName) {
        const cached = cache.get(config.toolName, input);
        if (cached !== null) {
          return cached;
        }
      }

      // 1. 执行工具获取 ToolResult
      let result = await retryWithBackoff(
        () => rawTool.execute(input, options),
        { maxRetries: config?.maxRetries, baseDelay: config?.baseDelay },
      );

      // 2. 序列化为 string（内部处理 hint injection）
      const serialized = serializeToolResult(result, mergedTemplates, config?.toolName);

      // 3. 成功结果写入缓存
      if (cache && config?.toolName && result.ok) {
        cache.set(config.toolName, input, serialized);
      }

      return serialized;
    } catch (error) {
      // 4. 异常兜底 — 确保永远返回 string
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[harness] 工具内部异常:', error);
      return `[Error] Internal tool exception: ${msg}`;
    }
  };

  return tool({
    description: rawTool.description ?? '',
    inputSchema: rawTool.inputSchema,
    execute: wrappedExecute,
  } as any);
}
