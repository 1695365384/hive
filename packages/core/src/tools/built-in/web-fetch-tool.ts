/**
 * Web Fetch 工具 — URL 内容抓取并提取纯文本
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 依赖 cheerio（HTML 解析）+ 纯文本提取。
 * 内置 SSRF 防护：仅允许 HTTPS，拒绝内网 IP。
 */

import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { truncateOutput } from './utils/output-safety.js';
import { isAllowedUrl, isPrivateIP } from './utils/security.js';
import { cleanAndCompress } from './search-engines/utils.js';
import type { ToolResult } from '../harness/types.js';
import { withHarness } from '../harness/with-harness.js';
import type { RawTool } from '../harness/with-harness.js';

/** 需要移除的 HTML 噪音元素 */
const NOISE_SELECTORS = [
  'script', 'style', 'nav', 'footer', 'header',
  'iframe', 'noscript', 'aside', '.ad', '.ads',
  '.cookie-banner', '.popup', '.modal', '.newsletter',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
];

/** 主要内容选择器（优先级） */
const MAIN_CONTENT_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '.article-content', '.post-content', '.entry-content',
  '.content', '#content',
];

/**
 * 用 cheerio 提取主要内容的纯文本
 * 
 * 优先尝试文章/主要内容标签，用 .text() 直接提取纯文本（无 HTML 标签）
 */
function extractMainContent(html: string): string {
  const $ = cheerio.load(html);

  // 移除噪音元素
  for (const selector of NOISE_SELECTORS) {
    $(selector).remove();
  }

  // 尝试查找主要内容区域
  for (const selector of MAIN_CONTENT_SELECTORS) {
    const content = $(selector);
    if (content.length > 0 && content.text().trim().length > 100) {
      return content.text();
    }
  }

  // 降级：使用 body 纯文本
  return $('body').text();
}

/**
 * 压缩纯文本
 * 
 * - 多个空格/换行 → 单空格
 * - 中文空格处理
 * - 移除多余制表符
 */
function compressText(text: string): string {
  return text
    .replace(/\u3000+/g, ' ')        // 中文空格 → 单空格
    .replace(/\s+/g, ' ')             // 多个空格/换行/制表符 → 单空格
    .trim();
}

/** Web Fetch 工具输入 schema */
const webFetchInputSchema = z.object({
  url: z.string().describe('Web page URL to fetch (HTTPS only)'),
  maxChars: z.number().max(100000).optional().describe('Max characters of content to return, default 30000'),
});

export type WebFetchToolInput = z.infer<typeof webFetchInputSchema>;

/** 创建原始工具（execute → ToolResult，不经 harness） */
export function createRawWebFetchTool(): RawTool<WebFetchToolInput> {
  return {
    description: 'Fetch web page content (plain text) from a URL. Automatically strips navigation, ads, and noise to extract main content. Use for documentation pages, blog articles, etc. HTTPS only.',
    inputSchema: zodSchema(webFetchInputSchema),
    execute: async ({ url, maxChars }): Promise<ToolResult> => {
      try {
        // URL scheme 校验
        const urlCheck = isAllowedUrl(url);
        if (!urlCheck.allowed) {
          return { ok: false, code: 'INVALID_PARAM', error: urlCheck.reason, context: { url } };
        }

        // SSRF 检查：拒绝内网 IP
        const hostname = new URL(url).hostname;
        const privateCheck = await isPrivateIP(hostname);
        if (privateCheck) {
          return { ok: false, code: 'PATH_BLOCKED', error: `Access to private network address denied: ${hostname}` };
        }

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html',
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          return { ok: false, code: 'NETWORK', error: `Request failed (HTTP ${response.status})`, context: { status: String(response.status) } };
        }

        const html = await response.text();

        // 用 cheerio 提取主要内容（纯文本）
        const mainContent = extractMainContent(html);

        // 压缩纯文本（移除多余空白）
        const compressed = compressText(mainContent);

        if (!compressed.trim()) {
          return { ok: false, code: 'NOT_FOUND', error: 'Page content is empty' };
        }

        return { ok: true, code: 'OK', data: truncateOutput(compressed, maxChars) };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const isNetwork = /timeout|ECONNREFUSED|ENOTFOUND/i.test(msg);
        if (isNetwork) {
          return { ok: false, code: 'NETWORK', error: `Fetch failed: ${msg}` };
        }
        return { ok: false, code: 'EXEC_ERROR', error: `Fetch failed: ${msg}` };
      }
    },
  };
}

/**
 * 创建 Web Fetch 工具（AI SDK 兼容，execute → string）
 *
 * 内部使用 withHarness 包装 rawTool 逻辑。
 */
export function createWebFetchTool(): Tool<WebFetchToolInput, string> {
  return withHarness(createRawWebFetchTool(), { maxRetries: 2, baseDelay: 500, toolName: 'web-fetch-tool' });
}

export const webFetchTool = createWebFetchTool();
