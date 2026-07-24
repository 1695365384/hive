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
  /** 唯一标识（pi catalog provider id） */
  id: string;
  /** 显示名称 */
  name: string;
  /** Provider 类型（由 pi catalog 自动补全） */
  type?: ProviderType;
  /** API 基础 URL（由 pi catalog 自动补全，用户配置中不需要设置） */
  baseUrl?: string;
  /** API Key（用户配置或环境变量） */
  apiKey?: string;
  /** 默认模型（由 pi catalog 自动补全） */
  model?: string;
  /** 是否启用 */
  enabled?: boolean;
  /** 描述 */
  description?: string;
  /** 额外配置 */
  extra?: Record<string, unknown>;
}

/**
 * MCP stdio 服务器配置（本地进程）
 *
 * `transport` 可省略：缺省且存在 `command` 时视为 stdio（向后兼容）。
 */
export interface McpStdioServerConfig {
  transport?: 'stdio';
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
 * MCP HTTP 远程服务器配置（Streamable HTTP / SSE）
 */
export interface McpHttpServerConfig {
  transport: 'http';
  /** 远程 MCP 端点 URL（https） */
  url: string;
  /** 可选请求头（不含用户交互填入的 secret；v1 仅 allowlist 静态值） */
  headers?: Record<string, string>;
  /** 是否启用 */
  enabled?: boolean;
}

/**
 * MCP 服务器配置（stdio | http）
 */
export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;

/** 是否为 HTTP 远程配置 */
export function isHttpMcpConfig(config: McpServerConfig): config is McpHttpServerConfig {
  return (config as McpHttpServerConfig).transport === 'http'
    || typeof (config as McpHttpServerConfig).url === 'string';
}

/** 规范化配置：补齐 transport 默认值 */
export function normalizeMcpServerConfig(config: McpServerConfig): McpServerConfig {
  if (isHttpMcpConfig(config)) {
    return {
      transport: 'http',
      url: config.url,
      headers: config.headers,
      enabled: config.enabled,
    };
  }
  return {
    transport: 'stdio',
    command: config.command,
    args: config.args,
    env: config.env,
    enabled: config.enabled,
  };
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
  /** 最大输入 tokens */
  maxInputTokens?: number;
  /** 是否支持视觉/附件 */
  supportsVision?: boolean;
  /** 是否支持工具调用 */
  supportsTools?: boolean;
  /** 是否支持流式输出 */
  supportsStreaming?: boolean;
  /** 是否支持 `system` role 在 messages 数组中（默认 true） */
  supportsSystemMessages?: boolean;
  /** 是否支持推理（如 DeepSeek Reasoner） */
  supportsReasoning?: boolean;
  /** 是否支持结构化输出 */
  supportsStructuredOutput?: boolean;
  /** 是否支持 temperature 参数 */
  supportsTemperature?: boolean;
  /** 是否开源权重 */
  openWeights?: boolean;
  /** 知识截止日期 */
  knowledge?: string;
  /** 发布日期 */
  releaseDate?: string;
  /** 最后更新日期 */
  lastUpdated?: string;
  /** 交错思考输出配置（如 reasoning_content 字段） */
  interleaved?: { field: string };
  /** 模型状态 */
  status?: 'alpha' | 'beta' | 'deprecated';
  /** 输入模态 */
  inputModalities?: string[];
  /** 输出模态 */
  outputModalities?: string[];
  /** 定价（每百万 tokens） */
  pricing?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
    reasoning?: number;
    inputAudio?: number;
    outputAudio?: number;
    contextOver200k?: number;
    currency: 'USD' | 'CNY';
  };
  /** 模型别名 */
  aliases?: string[];
  /** 是否已弃用 */
  deprecated?: boolean;
}

// ============================================
// Pi catalog 提供商（UI / ProviderManager 共用 DTO）
// ============================================

/** oh-my-pi catalog 提供商条目（Desktop provider.list 协议形状）。 */
export interface PiCatalogProvider {
  id: string;
  name: string;
  baseUrl: string;
  envKeys: string[];
  docUrl?: string;
  logo?: string;
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
