/**
 * 必应搜索引擎实现
 * 
 * 使用 cheerio 解析必应搜索结果页面
 * 支持多种 DOM 选择策略，应对页面结构变化
 */

import * as cheerio from 'cheerio';
import type { SearchEngine, SearchResult } from './base.js';
import { extractTextFromElement, extractAttrFromElement } from './utils.js';

export class BingEngine implements SearchEngine {
  name = 'Bing';

  buildUrl(query: string): string {
    return `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  }

  async parse(html: string): Promise<SearchResult[]> {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    // 策略 1：主结果容器（li.b_algo）
    const mainResults = this.tryStrategyMain($);
    if (mainResults.length > 0) return mainResults;

    // 策略 2：备用选择器（[class*="organic"]）
    const backupResults = this.tryStrategyBackup($);
    if (backupResults.length > 0) return backupResults;

    return results;
  }

  /**
   * 策略 1：标准 DOM 结构
   * 标题：li.b_algo h2 a
   * URL：li.b_algo h2 a 的 href
   * 摘要：li.b_algo .b_caption p
   */
  private tryStrategyMain($: cheerio.CheerioAPI): SearchResult[] {
    const results: SearchResult[] = [];

    $('li.b_algo').each((_, item) => {
      const $item = $(item);
      const $link = $item.find('h2 a').first();
      const $snippet = $item.find('.b_caption p');

      const title = extractTextFromElement($, $link);
      const url = extractAttrFromElement($, $link, 'href');
      const snippet = extractTextFromElement($, $snippet);

      if (url && title.length > 0) {
        results.push({ title, url, snippet });
      }
    });

    return results;
  }

  /**
   * 策略 2：备用 DOM 结构
   * 如果必应页面结构变更，尝试通用选择器
   */
  private tryStrategyBackup($: cheerio.CheerioAPI): SearchResult[] {
    const results: SearchResult[] = [];

    $('[class*="organic"]').each((_, container) => {
      const $container = $(container);
      const $link = $container.find('a').first();
      const $snippet = $container.find('p, [class*="snippet"]').first();

      const title = extractTextFromElement($, $link);
      const url = extractAttrFromElement($, $link, 'href');
      const snippet = extractTextFromElement($, $snippet);

      if (url && title.length > 0) {
        results.push({ title, url, snippet });
      }
    });

    return results;
  }
}

export const bingEngine = new BingEngine();
