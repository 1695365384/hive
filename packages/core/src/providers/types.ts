/**
 * Provider 类型定义
 *
 * 统一的类型系统
 */

// ============================================
// Provider 类型
// ============================================

/**
 * Provider 类型
 */
export type ProviderType = 'openai' | 'anthropic' | 'google' | 'openai-compatible';

// ============================================
// Provider 配置
// ============================================

/**
 * Provider 配置
 */
export interface ProviderConfig {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** Provider 类型 */
  type?: ProviderType;
  /** API 基础 URL */
  baseUrl: string;
  /** API Key */
  apiKey?: string;
  /** 默认模型 */
  model?: string;
  /** 是否启用 */
  enabled?: boolean;
  /** 描述 */
  description?: string;
  /** 额外配置 */
  extra?: Record<string, unknown>;
}

/**
 * MCP 服务器配置
 */
export interface McpServerConfig {
  /** 命令 */
  command: string;
  /** 参数 */
  args?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
  /** 是否启用 */
  enabled?: boolean;
}

/**
 * Agent 默认配置
 */
export interface AgentDefaults {
  model?: string;
  maxTurns?: number;
  thoroughness?: 'quick' | 'medium' | 'very-thorough';
}

// ============================================
// 模型规格
// ============================================

/**
 * 模型规格
 */
export interface ModelSpec {
  /** 模型 ID */
  id: string;
  /** 显示名称 */
  name?: string;
  /** 模型家族 */
  family?: string;
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
  /** 是否支持推理（如 DeepSeek Reasoner） */
  supportsReasoning?: boolean;
  /** 输入模态 */
  inputModalities?: string[];
  /** 输出模态 */
  outputModalities?: string[];
  /** 定价（每百万 tokens） */
  pricing?: {
    input: number;
    output: number;
    cacheRead?: number;
    currency: 'USD' | 'CNY';
  };
  /** 模型别名 */
  aliases?: string[];
  /** 是否已弃用 */
  deprecated?: boolean;
}

// ============================================
// Models.dev API 类型
// ============================================

/**
 * Models.dev API 原始模型格式
 */
export interface ModelsDevModelRaw {
  id: string;
  name: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  modalities?: {
    input: string[];
    output: string[];
  };
  cost?: {
    input: number;
    output: number;
    cache_read?: number;
  };
  limit?: {
    context: number;
    output: number;
  };
}

/**
 * Models.dev API 原始提供商格式
 */
export interface ModelsDevProviderRaw {
  id: string;
  name: string;
  env?: string[];
  npm?: string;
  api?: string;
  doc?: string;
  models: Record<string, ModelsDevModelRaw>;
}

/**
 * Models.dev API 完整响应格式
 */
export interface ModelsDevResponse {
  providers: Record<string, ModelsDevProviderRaw>;
}

/**
 * 转换后的提供商信息
 */
export interface ModelsDevProvider {
  id: string;
  name: string;
  baseUrl: string;
  envKeys: string[];
  npmPackage: string;
  docUrl?: string;
  type: ProviderType;
  models: ModelSpec[];
}

// ============================================
// 预设配置
// ============================================

/**
 * Provider 预设
 */
export interface ProviderPreset {
  /** 预设 ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** API 基础 URL */
  baseUrl: string;
  /** 环境变量 Key 名 */
  envKey: string;
  /** 默认模型 */
  defaultModel?: string;
  /** 分类 */
  category?: 'chinese' | 'openai' | 'gateway' | 'anthropic';
  /** 预置模型规格 */
  models?: ModelSpec[];
  /** 描述 */
  description?: string;
}

// ============================================
// 外部配置（新版 API）
// ============================================

/**
 * Agent 默认配置
 */
export interface AgentDefaults {
  /** 默认模型（覆盖 Provider 设置） */
  model?: string;
  /** 最大对话轮次 */
  maxTurns?: number;
  /** 探索彻底程度 */
  thoroughness?: 'quick' | 'medium' | 'very-thorough';
  /** 单次请求超时（毫秒） */
  timeout?: number;
  /** 是否启用流式输出 */
  streaming?: boolean;
}

/**
 * 外部配置接口
 *
 * 由外部应用传入，SDK 不负责配置的持久化或发现
 */
export interface ExternalConfig {
  /** Provider 配置列表 */
  providers?: ProviderConfig[];
  /** 当前激活的 Provider ID */
  activeProvider?: string;
  /** MCP 服务器配置 */
  mcpServers?: Record<string, McpServerConfig>;
  /** Agent 默认配置 */
  defaults?: AgentDefaults;
}

/**
 * API Key 来源配置
 */
export interface ApiKeyConfig {
  /** 直接提供 API Key */
  apiKey?: string;
  /** 环境变量名（默认 ${PROVIDER_ID}_API_KEY） */
  apiKeyEnv?: string;
}

// ============================================
// 配置来源
// ============================================

/**
 * 配置来源接口
 */
export interface ConfigSource {
  /** 来源名称 */
  readonly name: string;
  /** 获取单个 Provider */
  getProvider(id: string): ProviderConfig | null;
  /** 获取所有 Provider */
  getAllProviders(): ProviderConfig[];
  /** 获取 MCP 服务器配置 */
  getMcpServers(): Record<string, McpServerConfig>;
  /** 获取默认 Provider ID */
  getDefaultProviderId?(): string | null;
  /** 是否可用 */
  isAvailable(): boolean;
}

// ============================================
// Provider 接口
// ============================================

/**
 * Provider 接口
 */
export interface IProvider {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly apiKey: string | undefined;
  readonly defaultModel: string | undefined;

  /** 应用配置到环境变量 */
  apply(): void;
  /** 获取模型列表 */
  getModels(): Promise<ModelSpec[]>;
  /** 获取模型规格 */
  getModelSpec(modelId: string): Promise<ModelSpec | undefined>;
}
