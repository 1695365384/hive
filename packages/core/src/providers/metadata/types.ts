/**
 * 提供商元数据类型
 *
 * 缓存数据结构和相关类型定义
 */

/**
 * 模型信息（简化版，用于缓存）
 */
export interface CachedModelInfo {
  /** 模型 ID */
  id: string
  /** 模型名称 */
  name: string
  /** 上下文窗口 */
  contextWindow: number
  /** 最大输出 token */
  maxOutputTokens?: number
  /** 是否支持视觉 */
  supportsVision?: boolean
  /** 是否支持工具 */
  supportsTools?: boolean
}

/**
 * 提供商信息（简化版，用于缓存）
 */
export interface CachedProviderInfo {
  /** 提供商 ID */
  id: string
  /** 显示名称 */
  name: string
  /** API 基础 URL */
  baseUrl: string
  /** 提供商类型 */
  type: string
  /** 环境变量 Key 列表 */
  envKeys: string[]
  /** npm 包名 */
  npmPackage: string
  /** 模型列表 */
  models: CachedModelInfo[]
}

/**
 * Models.dev 缓存数据结构
 */
export interface ModelsDevCache {
  /** 缓存版本 */
  version: string
  /** 获取时间 ISO 字符串 */
  fetchedAt: string
  /** 过期时间 ISO 字符串 */
  expiresAt: string
  /** 提供商数据 */
  providers: CachedProviderInfo[]
}
