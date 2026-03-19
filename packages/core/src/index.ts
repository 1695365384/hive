/**
 * Claude Agent Service - 面向 C 端的可嵌入 SDK
 *
 * 核心设计：
 * - 主 Agent 作为唯一入口
 * - 管理子 Agent（Explore, Plan, General 等）
 * - 管理提供商（CC-Switch + 内置预设）
 * - 执行工作流
 *
 * 架构：
 * ┌─────────────────────────────────────────┐
 * │            主 Agent (Agent)             │
 * │      唯一入口，管理所有功能               │
 * ├─────────────────────────────────────────┤
 * │           子 Agent 系统                  │
 * │  Explore | Plan | General | Extended   │
 * ├─────────────────────────────────────────┤
 * │           提供商管理                     │
 * │  CC-Switch + 内置预设                   │
 * ├─────────────────────────────────────────┤
 * │         Claude Agent SDK                │
 * └─────────────────────────────────────────┘
 *
 * 使用方式：
 * ```typescript
 * import { Agent, createAgent, ask } from 'claude-agent-service';
 *
 * // 方式 1: 创建实例
 * const agent = new Agent();
 * await agent.chat('你好');
 * await agent.explore('查找 API');
 * await agent.runWorkflow('添加功能');
 *
 * // 方式 2: 便捷函数
 * await ask('你好');
 * await explore('查找 API');
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
  explore,
  plan,
  general,
  runWorkflow,

  // 类型
  type AgentOptions,
  type WorkflowOptions,
  type WorkflowResult,
} from './agents/index.js';

// ============================================
// 子 Agent（高级用户）
// ============================================

export {
  // 类型
  type AgentType,
  type AgentConfig,
  type AgentExecuteOptions,
  type AgentResult,
  type ThoroughnessLevel,

  // 内置 Agent
  CORE_AGENTS,
  EXTENDED_AGENTS,
  BUILTIN_AGENTS,
  getAgentConfig,
  getCoreAgentNames,
  getExtendedAgentNames,
  getAllAgentNames,

  // Agent 运行器
  AgentRunner,
  createAgentRunner,
  runAgent,
  runExplore,
  runPlan,
  runGeneral,

  // Task 系统（类似 Claude Code 的 Task Tool）
  Task,
  createTask,
  runTask,
  runParallel,
  mapParallel,
  runExploreTask,
  runPlanTask,
  runGeneralTask,
  type TaskConfig,
  type TaskResult,
  type ParallelTaskConfig,

  // Prompt 模板
  THOROUGHNESS_PROMPTS,
  EXPLORE_AGENT_PROMPT,
  PLAN_AGENT_PROMPT,
  GENERAL_AGENT_PROMPT,
  buildExplorePrompt,
  buildPlanPrompt,
} from './agents/index.js';

// ============================================
// 提供商管理
// ============================================

export {
  // 核心类
  ProviderManager,
  getProviderManager,
  createProviderManager,
  providerManager,

  // 配置来源
  CCSwitchSource,
  LocalConfigSource,
  EnvSource,
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
  getModelsDevClient,
  createModelsDevClient,
  getStaticModels,
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
} from './providers/index.js';

// 向后兼容的类型别名
export type { ProviderConfig as CCProvider, McpServerConfig as CCMcpServer } from './providers/index.js';

// ============================================
// MCP 服务器（高级用户）
// ============================================

export { memoryMcpServer } from './tools/memory-tools.js';

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
