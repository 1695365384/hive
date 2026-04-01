/**
 * 搜索引擎公共工具函数
 * 
 * 使用 cheerio 安全提取和清理文本，确保输出是纯文本（无 HTML 标签）
 */

import * as cheerio from 'cheerio';

/**
 * 清理和压缩文本
 * - 多个空格/换行 → 单空格
 * - 中文空格 → 单空格
 * - 移除制表符
 * - 限制长度
 */
export function cleanAndCompress(text: string, maxLength: number = 200): string {
  return text
    .replace(/\u3000+/g, ' ')        // 中文空格 → 单空格
    .replace(/\s+/g, ' ')             // 多个空格/换行/制表符 → 单空格
    .trim()
    .slice(0, maxLength);
}

/**
 * 用 cheerio 安全提取纯文本（自动移除所有 HTML 标签）
 * 
 * 比正则表达式更可靠，避免标签嵌套导致的问题
 */
export function extractTextWithCheerio(html: string, selector: string): string[] {
  const $ = cheerio.load(html);
  return $(selector)
    .map((_, el) => $(el).text())
    .get()
    .filter(text => text.trim().length > 0)
    .map(text => cleanAndCompress(text));
}

/**
 * 提取单个元素的纯文本
 */
export function extractTextFromElement($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>): string {
  return cleanAndCompress($el.text());
}

/**
 * 提取属性值（如 href）
 */
export function extractAttrFromElement($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>, attr: string): string {
  return $el.attr(attr) ?? '';
}
