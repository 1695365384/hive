/**
 * Hive Core - 多 Agent 协作框架
 *
 * 核心设计：
 * - 主 Agent 作为唯一入口
 * - 统一任务分发（dispatch）
 * - 管理提供商（EnvSource + pi catalog）
 *
 * 架构：
 * ┌─────────────────────────────────────────┐
 * │            主 Agent (Agent)             │
 * │    唯一入口：dispatch() / chat()         │
 * ├─────────────────────────────────────────┤
 * │     AgentLoop               │
 * │  Coordinator 模式 + Worker 委派       │
 * ├─────────────────────────────────────────┤
 * │           提供商管理                     │
 * │  EnvSource + pi catalog                 │
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

// AgentLoop replaced by AgentLoop. Use Agent.dispatch() directly.

export type {
  DispatchOptions,
  DispatchResult,
  DispatchTraceEvent,
  AdversarialConfig,
} from './agents/index.js';

// ============================================
// 场景路由（ScenarioRouter）
// ============================================

export {
  ScenarioRegistry,
  TaskRouter,
  createDefaultScenarioRegistry,
  createDefaultTaskRouter,
  defaultTaskRouter,
  getScenarioLabel,
  getAllScenarioLabels,
  validateWorkerSpawn,
  OFFICE_SCENARIO_ID,
  OFFICE_SCENARIO_LABELS,
  SCHEDULE_SCENARIO_ID,
  SCHEDULE_SCENARIO_LABELS,
  NAMED_WORKER_SCENARIO_ID,
  NAMED_WORKER_SCENARIO_LABELS,
  officeScenario,
  scheduleScenario,
  namedWorkerScenario,
  buildOfficeWorkerSpawn,
  buildScheduleWorkerSpawn,
  buildNamedWorkerSpawn,
  detectNamedWorkerType,
  hasNoArtifactIntent,
} from './routing/index.js';

export type {
  WorkerSpawnInput,
  ScenarioDefinition,
  RouterDecision,
  ScenarioLabels,
} from './routing/index.js';

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

  // Prompt 模板
  THOROUGHNESS_PROMPTS,
  buildExplorePrompt,
} from './agents/index.js';

// ============================================
// 提供商管理
// ============================================

export {
  ProviderManager,
  createProviderManager,
  EnvSource,
  normalizeProviderId,
  warmPiCatalog,
  listPiProviders,
  listPiProviderModels,
  createConfigChain,
  type ProviderConfig,
  type McpServerConfig,
  type McpStdioServerConfig,
  type McpHttpServerConfig,
  type ModelSpec,
  type ProviderPreset,
  type ConfigSource,
  type IProvider,
  type ProviderType,
  type PiCatalogProvider,
  isHttpMcpConfig,
  normalizeMcpServerConfig,
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
  isPathAllowed,
  setAllowedRoots,
  addAllowedRoot,
  _resetAllowedRoots,
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
  ModelAwareTokenCounter,
  SimpleTokenCounter,
  createTokenCounter,
  calculateThreshold,
  calculateEffectiveBudget,
  shouldCompress,
  registerTokenizer,
  type TokenizerFn,

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
  type SessionConfig as WorkspaceSessionConfig,
  type StorageConfig,
  type Preferences,

  // 常量
  DEFAULT_WORKSPACE_DIR,
  DEFAULT_WORKSPACE_NAME,
  WORKSPACE_VERSION,

  // 管理器
  WorkspaceManager,
  initWorkspace,
  createWorkspaceManager,

  // 会话工作区（写沙箱）
  type SessionFsContext,
  getHiveHomeDir,
  sanitizeSessionId,
  getSessionWorkspacePath,
  ensureSessionWorkspace,
  buildDefaultReadRoots,
  createSessionFsContext,
  runWithSessionFs,
  getSessionFs,
  getWorkingDirectory,
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

  GoalRepository,
  createGoalRepository,
  type IGoalRepository,

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
// 流式事件与回调
// ============================================

export type {
  StreamingEventUnion,
  StreamingHandler,
  FileEvent,
  FileHandler,
  MessageHandler,
} from './server/types.js';

// ============================================
// 环境探测
// ============================================

export {
  probeEnvironment,
  scanEnvironment,
} from './environment/index.js';

export type {
  EnvironmentContext,
} from './environment/index.js';

// ============================================
// 文件型记忆系统
// ============================================

export {
  FileMemory,
} from './memory/index.js';

// ============================================
// Server 工厂
// ============================================

export {
  createServer,
  SessionId,
} from './server/index.js';

export type {
  Server,
  ServerOptions,
  ParsedSessionId,
} from './server/index.js';

// ============================================
// 工具函数
// ============================================

export { safeJsonParse } from './utils/safe-json-parse.js';

// ============================================
// Vertical Pack 系统（垂直场景扩展）
// ============================================

export {
  PackManager,
  createPackManager,
} from './vertical/index.js';

export type {
  VerticalPack,
  ToolDefinition,
  HookRegistration,
  SubAgentDefinition,
  SkillDefinition,
  PackSetupContext,
} from './vertical/index.js';

export {
  PackError,
  PackCycleError,
  PackDependencyMissingError,
} from './vertical/index.js';

// ============================================
// MCP 系统（Model Context Protocol）
// ============================================

export {
  McpClient,
  mcpToolToAiTool,
  McpManager,
  McpRemoteClient,
  getMcpConfigPath,
  loadPersistedMcpServers,
  savePersistedMcpServers,
  upsertPersistedMcpServer,
  removePersistedMcpServer,
  loadPersistedMcpServersIntoManager,
} from './mcp/index.js';

export type {
  McpToolDefinition,
  McpServerInfo,
  McpServerStatusCallback,
  McpToolCaller,
  LoadPersistedMcpOptions,
} from './mcp/index.js';
