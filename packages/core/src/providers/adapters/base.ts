/**
 * AI SDK Provider 适配器基础接口
 *
 * 定义统一的适配器接口，用于创建 AI SDK 模型实例
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderConfig } from '../types.js';
import type { ProviderType } from '../types.js';

// Re-export ProviderType from canonical source
export type { ProviderType } from '../types.js';

/**
 * 适配器配置
 */
export interface AdapterConfig extends ProviderConfig {
  type: ProviderType;
}

/**
 * Provider 适配器接口
 *
 * 每个厂商需要实现此接口
 */
export interface ProviderAdapter {
  /** 适配器类型 */
  readonly type: ProviderType;

  /**
   * 创建 AI SDK 模型实例
   *
   * @param config Provider 配置
   * @param modelId 可选的模型 ID，不提供则使用默认
   */
  createModel(config: ProviderConfig, modelId?: string): LanguageModelV3;

  /**
   * 获取默认模型 ID
   */
  getDefaultModel(): string;

  /**
   * 获取 Provider ID（用于 Models.dev 查询）
   */
  getProviderId(): string;

  /**
   * 验证配置是否有效
   */
  validateConfig(config: ProviderConfig): boolean;
}

/**
 * 适配器工厂函数类型
 */
export type AdapterFactory = (config: ProviderConfig) => ProviderAdapter;
