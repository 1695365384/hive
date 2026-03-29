/**
 * 配置来源模块
 *
 * 定义统一的配置来源接口和实现
 * 简化版：只支持环境变量和外部传入配置
 */

import type { ConfigSource } from '../types.js';
import { EnvSource } from './env.js';
import { ModelsDevSource, createModelsDevSource, getModelsDevSource } from './models-dev.js';

// 导出所有来源
export { EnvSource } from './env.js';
export { ModelsDevSource, createModelsDevSource, getModelsDevSource } from './models-dev.js';

// 导出类型
export type { ConfigSource } from '../types.js';

/**
 * 创建配置来源链
 *
 * 简化版：只使用 EnvSource 作为 fallback
 */
export function createConfigChain(): ConfigSource[] {
  return [
    new EnvSource(),
  ];
}
