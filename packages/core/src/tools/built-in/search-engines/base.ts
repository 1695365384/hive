/**
 * 搜索引擎基础接口
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchEngine {
  /** 引擎名称 */
  name: string;
  
  /** 构建搜索 URL */
  buildUrl(query: string): string;
  
  /** 从 HTML 解析搜索结果 */
  parse(html: string): Promise<SearchResult[]>;
}
