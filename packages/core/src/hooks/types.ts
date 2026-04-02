/**
 * Hook 类型定义（Barrel Re-export）
 *
 * 所有类型从 domain-specific 子模块重新导出，
 * 保持与原有 import 路径的完全向后兼容。
 */

// 核心类型（优先级、结果、基础上下文、处理器）
export {
  type HookPriority,
  HOOK_PRIORITY_VALUES,
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
  type HookHandler,
  type HookOptions,
} from './types/core.js';

// 扩展上下文类型（Provider、Skill、Agent、配置、类型映射、注册信息）
export type {
  ProviderBeforeChangeHookContext,
  ProviderAfterChangeHookContext,
  SkillMatchHookContext,
  AgentSpawnHookContext,
  AgentCompleteHookContext,
  ConfigBeforeUpdateHookContext,
  ConfigAfterUpdateHookContext,
  WorkerHookContext,
  HookTypeMap,
  HookType,
  RegisteredHook,
} from './types/contexts.js';

// 审计相关类型（错误恢复、缓存、执行追踪）
export type {
  ErrorRecoverHookContext,
  CacheHitHookContext,
  CacheMissHookContext,
  HookExecutionLog,
  ExecutionTrackingOptions,
} from './types/audit.js';

// 监控相关类型（超时、健康检查、推送通知）
export type {
  TimeoutApiHookContext,
  TimeoutExecutionHookContext,
  TimeoutStalledHookContext,
  HealthHeartbeatHookContext,
  AgentThinkingHookContext,
  TaskProgressHookContext,
  NotificationType,
  NotificationPushHookContext,
} from './types/monitoring.js';
