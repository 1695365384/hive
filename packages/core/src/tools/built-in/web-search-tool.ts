/**
 * Web Search 工具 — 多引擎搜索
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 支持 DuckDuckGo Lite、百度、必应等免费搜索引擎。
 * 使用 cheerio 提取纯文本结果，压缩大小到 HTML 的 2-5%。
 */

import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import { truncateOutput } from './utils/output-safety.js';
import type { ToolResult } from '../harness/types.js';
import { withHarness, type RawTool } from '../harness/with-harness.js';
import { SEARCH_ENGINES, type SearchEngineName } from './search-engines/index.js';

/** 最大返回结果数 */
const MAX_SEARCH_RESULTS = 10;

/** Web Search 工具输入 schema */
const webSearchInputSchema = z.object({
  query: z.string().describe('Search query keywords'),
  engine: z.enum(['duckDuckGo', 'baidu', 'bing'] as const)
    .optional()
    .default('duckDuckGo')
    .describe('Search engine, default duckDuckGo (international). Use baidu for Chinese, bing for international.'),
  maxResults: z.number().max(20).optional().describe('Max number of results, default 10'),
});

export type WebSearchToolInput = z.infer<typeof webSearchInputSchema>;

/**
 * 创建 Web Search rawTool（execute → ToolResult）
 *
 * 供 withHarness 包装使用，也供单元测试直接验证 ToolResult。
 */
export function createRawWebSearchTool(): RawTool<WebSearchToolInput> {
  return {
    description: 'Search the web for latest information. Supports DuckDuckGo Lite (international), Baidu (Chinese), Bing. No API key required. Returns titles, URLs, and snippets (plain text, HTML stripped). For full page content, use web-fetch tool.',
    inputSchema: zodSchema(webSearchInputSchema),
    execute: async ({ query, engine, maxResults }): Promise<ToolResult> => {
      try {
        const searchEngine = SEARCH_ENGINES[engine];
        if (!searchEngine) {
          return { ok: false, code: 'INVALID_INPUT', error: `Unsupported search engine: ${engine}` };
        }

        const url = searchEngine.buildUrl(query);

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          return { ok: false, code: 'NETWORK', error: `Search request failed (HTTP ${response.status})`, context: { status: String(response.status) } };
        }

        const html = await response.text();
        const results = await searchEngine.parse(html);

        if (results.length === 0) {
          return { ok: true, code: 'OK', data: `No search results found for "${query}"` };
        }

        const max = Math.min(maxResults ?? MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS);
        const display = results.slice(0, max);
        const output = display
          .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
          .join('\n\n');

        const suffix = results.length > max
          ? `\n\n[${results.length} results total, showing first ${max}]`
          : '';

        return { ok: true, code: 'OK', data: truncateOutput(output + suffix) };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const isNetwork = /timeout|ECONNREFUSED|ENOTFOUND/i.test(msg);
        if (isNetwork) {
          return { ok: false, code: 'NETWORK', error: `Search failed: ${msg}` };
        }
        return { ok: false, code: 'EXEC_ERROR', error: `Search failed: ${msg}` };
      }
    },
  };
}

/**
 * 创建 Web Search 工具（AI SDK 兼容，execute → string）
 *
 * 内部使用 createRawWebSearchTool + withHarness 包装。
 */
export function createWebSearchTool(): Tool<WebSearchToolInput, string> {
  return withHarness(createRawWebSearchTool(), { maxRetries: 2, baseDelay: 500, toolName: 'web-search-tool' });
}

export const webSearchTool = createWebSearchTool();
