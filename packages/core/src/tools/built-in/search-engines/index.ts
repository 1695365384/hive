/**
 * 搜索引擎导出
 */

export * from './base.js';
export * from './utils.js';
export * from './duckduckgo.js';
export * from './baidu.js';
export * from './bing.js';

import { duckDuckGoLiteEngine } from './duckduckgo.js';
import { baiduEngine } from './baidu.js';
import { bingEngine } from './bing.js';

/** 内置搜索引擎集合 */
export const SEARCH_ENGINES = {
  duckDuckGo: duckDuckGoLiteEngine,
  baidu: baiduEngine,
  bing: bingEngine,
};

/** 引擎名称字面量 */
export type SearchEngineName = keyof typeof SEARCH_ENGINES;

/**
 * 获取搜索引擎实例
 */
export function getSearchEngine(name: SearchEngineName) {
  return SEARCH_ENGINES[name];
}
