/**
 * Web Search 工具 — DuckDuckGo Lite 搜索
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 免费搜索，无需 API key。
 */

import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import { truncateOutput } from './utils/output-safety.js';
import type { ToolResult } from '../harness/types.js';
import { withHarness, type RawTool } from '../harness/with-harness.js';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * 解析 DuckDuckGo Lite HTML 页面
 */
async function parseDuckDuckGoLite(html: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const resultsRegex = /<tr class="result-link"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

  let match: RegExpExecArray | null;
  while ((match = resultsRegex.exec(html)) !== null) {
    const url = match[1]!;
    const titleRaw = match[2]!.replace(/<[^>]+>/g, '').trim();
    const snippetRaw = match[3]!.replace(/<[^>]+>/g, '').trim();

    if (url && !url.startsWith('#')) {
      results.push({ title: titleRaw, url, snippet: snippetRaw });
    }
  }

  return results;
}

/** Web Search 工具输入 schema */
/** 最大返回结果数 */
const MAX_SEARCH_RESULTS = 10;

const webSearchInputSchema = z.object({
  query: z.string().describe('搜索查询关键词'),
  maxResults: z.number().max(20).optional().describe('最大返回结果数，默认 10'),
});

export type WebSearchToolInput = z.infer<typeof webSearchInputSchema>;

/**
 * 创建 Web Search rawTool（execute → ToolResult）
 *
 * 供 withHarness 包装使用，也供单元测试直接验证 ToolResult。
 */
export function createRawWebSearchTool(): RawTool<WebSearchToolInput> {
  return {
    description: '搜索网页获取最新信息。使用 DuckDuckGo 搜索引擎，返回标题、URL 和摘要。搜索结果可能不包含最新内容，建议结合 web-fetch 工具获取完整页面内容。',
    inputSchema: zodSchema(webSearchInputSchema),
    execute: async ({ query, maxResults }): Promise<ToolResult> => {
      try {
        const encoded = encodeURIComponent(query);
        const url = `https://lite.duckduckgo.com/lite/?q=${encoded}`;

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html',
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          return { ok: false, code: 'NETWORK', error: `搜索请求失败 (HTTP ${response.status})`, context: { status: String(response.status) } };
        }

        const html = await response.text();
        const results = await parseDuckDuckGoLite(html);

        if (results.length === 0) {
          return { ok: true, code: 'OK', data: `未找到 "${query}" 的搜索结果` };
        }

        const max = Math.min(maxResults ?? MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS);
        const display = results.slice(0, max);
        const output = display
          .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
          .join('\n\n');

        const suffix = results.length > max
          ? `\n\n[共 ${results.length} 个结果，已截断显示前 ${max} 个]`
          : '';

        return { ok: true, code: 'OK', data: truncateOutput(output + suffix) };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const isNetwork = /timeout|ECONNREFUSED|ENOTFOUND/i.test(msg);
        if (isNetwork) {
          return { ok: false, code: 'NETWORK', error: `搜索失败: ${msg}` };
        }
        return { ok: false, code: 'EXEC_ERROR', error: `搜索失败: ${msg}` };
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
