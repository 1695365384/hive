/**
 * 配置来源模块
 *
 * 环境变量 fallback + 外部传入配置（pi catalog 为元数据来源）。
 */

import type { ConfigSource } from '../types.js';
import { EnvSource } from './env.js';

export { EnvSource } from './env.js';
export type { ConfigSource } from '../types.js';

export function createConfigChain(): ConfigSource[] {
  return [new EnvSource()];
}
