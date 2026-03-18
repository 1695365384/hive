/**
 * 模型模块入口
 */

// 类型
export type { ModelSpec } from './spec.js';

// 动态获取
export { fetchModels, fetchModelDetail, getModelFetcher } from './fetcher.js';

// 静态注册表
export {
  getProviderModels,
  getModelSpec,
  getContextWindow,
  checkModelSupport,
  estimateCost,
  getAllModels,
  searchModels,
} from './registry.js';
