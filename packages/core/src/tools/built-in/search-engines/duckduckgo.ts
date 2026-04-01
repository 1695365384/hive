/**
 * DuckDuckGo Lite 搜索引擎实现
 * 
 * 使用 cheerio 解析 HTML，避免正则表达式脆弱性
 */

import * as cheerio from 'cheerio';
import type { SearchEngine, SearchResult } from './base.js';
import { extractTextFromElement, extractAttrFromElement } from './utils.js';

export class DuckDuckGoLiteEngine implements SearchEngine {
  name = 'DuckDuckGo Lite';

  buildUrl(query: string): string {
    return `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  }

  async parse(html: string): Promise<SearchResult[]> {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    // DuckDuckGo Lite 使用 <tr class="result-link"> 包装搜索结果
    // 每行包含：<a> 标题链接、<td class="result-snippet"> 摘要
    $('tr.result-link').each((_, row) => {
      const $row = $(row);
      const $link = $row.find('a').first();
      const $snippet = $row.find('td.result-snippet');

      const title = extractTextFromElement($, $link);
      const url = extractAttrFromElement($, $link, 'href');
      const snippet = extractTextFromElement($, $snippet);

      // 过滤无效结果
      if (url && !url.startsWith('#') && title.length > 0) {
        results.push({ title, url, snippet });
      }
    });

    return results;
  }
}

export const duckDuckGoLiteEngine = new DuckDuckGoLiteEngine();
