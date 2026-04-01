/**
 * Hive Core - 多 Agent 协作框架
 *
 * 核心设计：
 * - 主 Agent 作为唯一入口
 * - 统一任务分发（dispatch）
 * - 管理提供商（EnvSource + 内置预设）
 *
 * 架构：
 * ┌─────────────────────────────────────────┐
 * │            主 Agent (Agent)             │
 * │    唯一入口：dispatch() / chat()         │
 * ├─────────────────────────────────────────┤
 * │       ExecutionCapability               │
 * │  streamText + 全量工具 + subagent tools │
 * ├─────────────────────────────────────────┤
 * │           提供商管理                     │
 * │  EnvSource + 内置预设                   │
 * ├─────────────────────────────────────────┤
 * │         LLM Provider SDK                │
 * └─────────────────────────────────────────┘
 *
 * 使用方式：
 * ```typescript
 * import { Agent, createAgent, ask } from '@bundy-lmw/hive-core';
 *
 * // 方式 1: 创建实例
 * const agent = new Agent();
 * await agent.dispatch('你好');
 * await agent.dispatch('添加功能', { forceMode: 'plan' });
 *
 * // 方式 2: 便捷函数
 * await ask('你好');
 * ```
 */

// ============================================
// 主 Agent（核心入口）
// ============================================

export {
  // 主类
  Agent,
  getAgent,
  createAgent,

  // 便捷函数
  ask,

  // 类型
  type AgentInitOptions,
} from './agents/index.js';

// ============================================
// 统一任务执行
// ============================================

export {
  ExecutionCapability,
} from './agents/index.js';

export type {
  ForceMode,
  DispatchOptions,
  DispatchResult,
  DispatchTraceEvent,
} from './agents/index.js';

// ============================================
// 子 Agent（高级用户）
// ============================================

export {
  // 类型
  type AgentType,
  type AgentConfig,
  type AgentResult,
  type ThoroughnessLevel,

  // 内置 Agent
  CORE_AGENTS,
  BUILTIN_AGENTS,
  getAgentConfig,
  getAllAgentNames,

  // Agent 运行器
  AgentRunner,
  createAgentRunner,

  // Task 系统（合并到 AgentRunner）
  type TaskConfig,
  type TaskResult,
  type ParallelTaskConfig,

  // Prompt 模板
  THOROUGHNESS_PROMPTS,
  buildExplorePrompt,
  buildPlanPrompt,
} from './agents/index.js';

// ============================================
// 提供商管理
// ============================================

export {
  // 核心类
  ProviderManager,
  createProviderManager,

  // 配置来源
  EnvSource,
  ModelsDevSource,
  createModelsDevSource,
  getModelsDevSource,
  createConfigChain,

  // AI SDK 适配器
  createAdapter,
  createOpenAIAdapter,
  createAnthropicAdapter,
  createGoogleAdapter,
  createOpenAICompatibleAdapter,
  getProviderType,
  getKnownProviders,
  getKnownProvidersSync,
  isKnownProvider,
  adapterRegistry,

  // 模型元数据
  fetchModelSpec,
  fetchProviderModels,

  // 类型
  type ProviderConfig,
  type McpServerConfig,
  type ModelSpec,
  type ProviderPreset,
  type ConfigSource,
  type IProvider,
  type ProviderType,
  type ProviderAdapter,
  type ModelsDevProvider,
} from './providers/index.js';

// ============================================
// 统一工具系统
// ============================================

export {
  ToolRegistry,
  createToolRegistry,
  type ToolAgentType,

  createBashTool,
  bashTool,
  createFileTool,
  fileTool,
  fileToolReadOnly,
  createGlobTool,
  globTool,
  createGrepTool,
  grepTool,
  createWebSearchTool,
  webSearchTool,
  createWebFetchTool,
  webFetchTool,
  createAskUserTool,
  askUserTool,
  setAskUserCallback,

  type BashToolOptions,
  type FileToolOptions,
  type AskUserCallback,

  truncateOutput,
  isDangerousCommand,
  isSensitiveFile,
} from './tools/index.js';

// ============================================
// 技能系统
// ============================================

export {
  // 类型
  type SkillMetadata,
  type Skill,
  type SkillContext,
  type SkillLoaderOptions,
  type SkillMatchResult,
  type SkillSystemConfig,

  // 加载器
  SkillLoader,
  createSkillLoader,
  parseFrontmatter,

  // 匹配器
  SkillMatcher,
  createSkillMatcher,
  extractTriggerPhrases,

  // 注册表
  SkillRegistry,
  getSkillRegistry,
  createSkillRegistry,
  initializeSkills,
} from './skills/index.js';

// ============================================
// Hooks 系统
// ============================================

export {
  // 注册表
  HookRegistry,

  // 类型
  type HookPriority,
  type HookResult,
  type SessionStartHookContext,
  type SessionEndHookContext,
  type SessionErrorHookContext,
  type ToolBeforeHookContext,
  type ToolBeforeHookModifiedContext,
  type ToolAfterHookContext,
  type CapabilityInitHookContext,
  type CapabilityDisposeHookContext,
  type WorkflowPhaseHookContext,
  type TimeoutApiHookContext,
  type TimeoutExecutionHookContext,
  type TimeoutStalledHookContext,
  type HealthHeartbeatHookContext,
  type HookTypeMap,
  type HookType,
  type HookHandler,
  type HookOptions,
  type RegisteredHook,
} from './hooks/index.js';

// ============================================
// 会话系统
// ============================================

export {
  // 类型
  type Message,
  type MessageRole,
  type CreateMessageOptions,
  type CompressionState,
  type SessionMetadata,
  type SessionConfig,
  type Session,
  type SessionStorageConfig,
  type SessionListItem,

  // 常量
  DEFAULT_STORAGE_DIR,
  DEFAULT_MAX_SESSIONS,
  DEFAULT_SESSION_TTL,

  // 存储
  SessionStorage,
  createSessionStorage,

  // 管理器
  SessionManager,
  createSessionManager,
  type SessionManagerConfig,
} from './session/index.js';

// ============================================
// 会话能力
// ============================================

export {
  SessionCapability,
  createSessionCapability,
  type SessionCapabilityConfig,
} from './agents/capabilities/index.js';

// ============================================
// 超时能力
// ============================================

export {
  TimeoutCapability,
  createTimeoutCapability,
} from './agents/capabilities/index.js';

// ============================================
// 超时和心跳类型
// ============================================

export type {
  TimeoutConfig,
  HeartbeatConfig,
} from './agents/core/types.js';

export { TimeoutError } from './agents/core/types.js';

// ============================================
// 压缩系统
// ============================================

export {
  // Token 计数器
  SimpleTokenCounter,
  createTokenCounter,
  calculateThreshold,
  shouldCompress,

  // 压缩服务
  CompressionService,
  createCompressionService,
  type CompressionServiceConfig,
  type CompressionResult,

  // 压缩策略
  SlidingWindowStrategy,
  createSlidingWindowStrategy,
  SummaryStrategy,
  createSummaryStrategy,
  HybridStrategy,
  createHybridStrategy,
  type HybridStrategyConfig,

  // 类型
  type CompressionStrategyName,
  type CompressionConfig,
  type CompressionContext,
  type CompressionStrategy,
  type TokenCounter,
  type TokenCounterConfig,

  // 常量
  DEFAULT_COMPRESSION_CONFIG,
  DEFAULT_TOKEN_COUNTER_CONFIG,
} from './compression/index.js';

// ============================================
// 工作空间系统
// ============================================

export {
  // 类型
  type WorkspaceMetadata,
  type WorkspaceConfig,
  type WorkspacePaths,
  type WorkspaceInitConfig,
  type SessionGroup,
  type SessionConfig as WorkspaceSessionConfig,
  type StorageConfig,
  type Preferences,

  // 常量
  DEFAULT_WORKSPACE_DIR,
  DEFAULT_WORKSPACE_NAME,
  WORKSPACE_VERSION,
  DEFAULT_SESSION_GROUPS,

  // 管理器
  WorkspaceManager,
  initWorkspace,
  createWorkspaceManager,
} from './workspace/index.js';

// ============================================
// 存储系统（SQLite）
// ============================================

export {
  // Database
  DatabaseManager,
  createDatabase,
  type DatabaseConfig,

  // Migration
  MigrationRunner,
  registerMigration,
  type Migration,

  // Repositories
  SessionRepository,
  createSessionRepository,
  type ISessionRepository,

  ScheduleRepository,
  createScheduleRepository,
  type IScheduleRepository,

  MemoryRepository,
  createMemoryRepository,
  type IMemoryRepository,
  type MemoryEntry,
} from './storage/index.js';

// ============================================
// 定时任务调度
// ============================================

export {
  ScheduleEngine,
  createScheduleEngine,
  isValidCron,
  getNextRunTime,
  HeartbeatScheduler,
} from './scheduler/index.js';

export type {
  Schedule,
  ScheduleRun,
  ScheduleAction,
  ScheduleStatus,
  ScheduleRunStatus,
  CreateScheduleInput,
  UpdateScheduleInput,
  ScheduleEngineConfig,
  ScheduleEngineStatus,
  TriggerContext,
  TriggerCallback,
  IScheduleEngine,
  HeartbeatSchedulerOptions,
} from './scheduler/index.js';

// ============================================
// 配置系统（外部配置支持）
// ============================================

export type {
  ExternalConfig,
  AgentDefaults,
} from './config/index.js';

// ============================================
// 插件系统
// ============================================

export {
  // 通道消息类型
  type ChannelMessage,
  type ChannelMessageType,
  type ChannelMessageSender,
  type ChannelMessageRecipient,

  // 通道发送
  type ChannelSendOptions,
  type ChannelSendResult,

  // 通道接口
  type ChannelCapabilities,
  type IChannel,
  type IWebhookHandler,

  // 插件上下文
  type IMessageBus,

  // 插件接口
  type PluginMetadata,
  type PluginContext,
  type IPlugin,

  // 插件加载
  type PluginLoadOptions,
  type IPluginLoader,
} from './plugins/index.js';

// ============================================
// 共享类型（从 types 模块直接导出）
// ============================================

export {
  type ILogger,
  noopLogger,
} from './types/logger.js';

// ============================================
// 消息总线
// ============================================

export {
  MessageBus,
} from './bus/index.js';

export type {
  BusMessage,
  Subscription,
  RequestContext,
  Middleware,
  MessageBusOptions,
  MessageBusEvents,
  BusEventType,
} from './bus/index.js';

// ============================================
// 环境探测
// ============================================

export {
  probeEnvironment,
} from './environment/index.js';

export type {
  EnvironmentContext,
} from './environment/index.js';

// ============================================
// Server 工厂
// ============================================

export {
  createServer,
} from './server/index.js';

export type {
  Server,
  ServerOptions,
} from './server/index.js';

// ============================================
// ============================================
// 工具函数
// ============================================

export { safeJsonParse } from './utils/safe-json-parse.js';
