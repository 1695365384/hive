/**
 * 模型规格类型定义
 */

/**
 * 模型规格
 */
export interface ModelSpec {
  /** 模型 ID */
  id: string;
  /** 显示名称 */
  name?: string;
  /** 上下文窗口大小（tokens） */
  contextWindow: number;
  /** 最大输出 tokens */
  maxOutputTokens?: number;
  /** 是否支持视觉 */
  supportsVision?: boolean;
  /** 是否支持工具调用 */
  supportsTools?: boolean;
  /** 是否支持流式输出 */
  supportsStreaming?: boolean;
  /** 定价（每百万 tokens） */
  pricing?: {
    input: number;
    output: number;
    currency: 'USD' | 'CNY';
  };
  /** 模型别名 */
  aliases?: string[];
  /** 是否已弃用 */
  deprecated?: boolean;
  /** 推荐替代 */
  replacement?: string;
}
