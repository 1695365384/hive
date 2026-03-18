/**
 * Provider 类型定义
 *
 * 统一的类型系统
 */

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
// 配置文件结构
// ============================================

/**
 * providers.json 配置结构
 */
export interface ProvidersConfig {
  version: string;
  description?: string;
  default?: string;
  providers: Record<string, Omit<ProviderConfig, 'id'>>;
  mcp_servers?: Record<string, McpServerConfig>;
  agent_defaults?: {
    explore?: AgentDefaults;
    plan?: AgentDefaults;
    general?: AgentDefaults;
  };
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
