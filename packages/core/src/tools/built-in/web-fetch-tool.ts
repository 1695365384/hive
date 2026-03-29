/**
 * Web Fetch 工具 — URL 内容抓取并转为 Markdown
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 依赖 cheerio（HTML 解析）+ turndown（HTML→Markdown）。
 * 内置 SSRF 防护：仅允许 HTTPS，拒绝内网 IP。
 */

import { tool, zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { truncateOutput } from './utils/output-safety.js';
import { isAllowedUrl, isPrivateIP } from './utils/security.js';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

/** 需要移除的 HTML 噪音元素 */
const NOISE_SELECTORS = [
  'script', 'style', 'nav', 'footer', 'header',
  'iframe', 'noscript', 'aside', '.ad', '.ads',
  '.cookie-banner', '.popup', '.modal', '.newsletter',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
];

/** Web Fetch 工具输入 schema */
const webFetchInputSchema = z.object({
  url: z.string().describe('要抓取的网页 URL（仅允许 https://）'),
  maxChars: z.number().max(100000).optional().describe('返回内容的最大字符数，默认 30000'),
});

export type WebFetchToolInput = z.infer<typeof webFetchInputSchema>;

/**
 * 创建 Web Fetch 工具
 */
export function createWebFetchTool(): Tool<WebFetchToolInput, string> {
  return tool({
    description: '获取指定 URL 的网页内容并转换为 Markdown 格式。自动去除导航、广告等噪音元素。适用于抓取文档页面、博客文章等。仅允许 HTTPS URL。',
    inputSchema: zodSchema(webFetchInputSchema),
    execute: async ({ url, maxChars }): Promise<string> => {
      try {
        // URL scheme 校验
        const urlCheck = isAllowedUrl(url);
        if (!urlCheck.allowed) {
          return `[Security] ${urlCheck.reason}`;
        }

        // SSRF 检查：拒绝内网 IP
        const hostname = new URL(url).hostname;
        const privateCheck = await isPrivateIP(hostname);
        if (privateCheck) {
          return `[Security] 拒绝访问内网地址: ${hostname}`;
        }

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html',
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          return `[Error] 请求失败 (HTTP ${response.status})`;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // 移除噪音元素
        for (const selector of NOISE_SELECTORS) {
          $(selector).remove();
        }

        // 转换为 Markdown
        const bodyHtml = $('body').html() || $.html();
        const markdown = turndown.turndown(bodyHtml);

        if (!markdown.trim()) {
          return `[Error] 页面内容为空`;
        }

        return truncateOutput(markdown, maxChars);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return `[Error] 抓取失败: ${msg}`;
      }
    },
  });
}

export const webFetchTool = createWebFetchTool();
