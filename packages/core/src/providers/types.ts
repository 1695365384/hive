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
  /** 唯一标识（对应 providers 表 id） */
  id: string;
  /** 显示名称 */
  name: string;
  /** Provider 类型（由 providers 表自动补全） */
  type?: ProviderType;
  /** AI SDK npm 包名（由 providers 表自动补全，用于适配器匹配） */
  npmPackage?: string;
  /** API 基础 URL（由 providers 表自动补全，用户配置中不需要设置） */
  baseUrl?: string;
  /** API Key（用户配置或环境变量） */
  apiKey?: string;
  /** 默认模型（由 providers 表自动补全） */
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
// Models.dev API 类型
// ============================================

/**
 * Models.dev API 原始模型格式
 *
 * @see https://models.dev
 */
export interface ModelsDevModelRaw {
  id: string;
  name: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  open_weights?: boolean;
  interleaved?: { field: string };
  modalities?: {
    input: string[];
    output: string[];
  };
  cost?: {
    input: number;
    output: number;
    cache_read?: number;
    cache_write?: number;
    reasoning?: number;
    input_audio?: number;
    output_audio?: number;
    context_over_200k?: number;
  };
  limit?: {
    context: number;
    input?: number;
    output: number;
  };
  status?: 'alpha' | 'beta' | 'deprecated';
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
  logo?: string;
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
  logo?: string;
  type: ProviderType;
  models: ModelSpec[];
}

// ============================================
// Provider Registry 注册信息
// ============================================

/**
 * Provider 注册信息
 *
 * 内置 Registry 中存储的已知 Provider 默认配置。
 * ProviderManager 根据 id 查询 Registry 自动补全缺失配置。
 */
export interface ProviderRegistration {
  /** API 基础 URL */
  baseUrl: string;
  /** Provider 类型 */
  type?: ProviderType;
  /** 默认模型 */
  defaultModel?: string;
  /** 参数预处理规则 */
  preprocessRules?: PreprocessRule[];
  /** 环境变量 Key（用于 apiKey fallback） */
  envKeys?: string[];
}

/**
 * 参数预处理规则
 */
export interface PreprocessRule {
  /** 要移除的参数字段 */
  remove?: string[];
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
