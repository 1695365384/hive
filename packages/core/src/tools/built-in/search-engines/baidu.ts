/**
 * 百度搜索引擎实现
 * 
 * 使用 cheerio 解析百度搜索结果页面
 * 支持多种 DOM 选择策略，应对页面结构变化
 */

import * as cheerio from 'cheerio';
import type { SearchEngine, SearchResult } from './base.js';
import { extractTextFromElement, extractAttrFromElement } from './utils.js';

export class BaiduEngine implements SearchEngine {
  name = 'Baidu';

  buildUrl(query: string): string {
    return `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
  }

  async parse(html: string): Promise<SearchResult[]> {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    // 策略 1：主结果容器（#content_left > div > .result）
    const mainResults = this.tryStrategyMain($);
    if (mainResults.length > 0) return mainResults;

    // 策略 2：备用选择器（.c-container）
    const backupResults = this.tryStrategyBackup($);
    if (backupResults.length > 0) return backupResults;

    return results;
  }

  /**
   * 策略 1：标准 DOM 结构
   * 标题：#content_left > div[id^="result_"] div.t a
   * 摘要：.c-snippet
   */
  private tryStrategyMain($: cheerio.CheerioAPI): SearchResult[] {
    const results: SearchResult[] = [];

    $('#content_left > div[id^="result_"]').each((_, container) => {
      const $container = $(container);
      const $link = $container.find('.t a').first();
      const $snippet = $container.find('.c-snippet, .noua.s-up + div');

      const title = extractTextFromElement($, $link);
      const url = extractAttrFromElement($, $link, 'href');
      const snippet = extractTextFromElement($, $snippet);

      if (url && !url.startsWith('javascript:') && title.length > 0) {
        results.push({ title, url, snippet });
      }
    });

    return results;
  }

  /**
   * 策略 2：备用 DOM 结构
   * 如果百度页面更新，尝试通用容器选择器
   */
  private tryStrategyBackup($: cheerio.CheerioAPI): SearchResult[] {
    const results: SearchResult[] = [];

    $('.c-container').each((_, container) => {
      const $container = $(container);
      const $link = $container.find('a[data-click^="{}"]').first() || $container.find('a').first();
      const $snippet = $container.find('.s-secondary');

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

export const baiduEngine = new BaiduEngine();
