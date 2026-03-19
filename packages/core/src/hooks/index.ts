/**
 * Hooks 模块
 *
 * 提供 agent 系统的 hooks 机制
 */

// 导出类型
export {
  // 优先级
  type HookPriority,
  HOOK_PRIORITY_VALUES,

  // 结果
  type HookResult,

  // 基础上下文
  type SessionStartHookContext,
  type SessionEndHookContext,
  type SessionErrorHookContext,
  type ToolBeforeHookContext,
  type ToolBeforeHookModifiedContext,
  type ToolAfterHookContext,
  type CapabilityInitHookContext,
  type CapabilityDisposeHookContext,
  type WorkflowPhaseHookContext,

  // 扩展上下文 - Provider
  type ProviderBeforeChangeHookContext,
  type ProviderAfterChangeHookContext,

  // 扩展上下文 - Skill
  type SkillMatchHookContext,

  // 扩展上下文 - Agent
  type AgentSpawnHookContext,
  type AgentCompleteHookContext,

  // 扩展上下文 - Config
  type ConfigBeforeUpdateHookContext,
  type ConfigAfterUpdateHookContext,

  // 扩展上下文 - Error Recovery
  type ErrorRecoverHookContext,

  // 扩展上下文 - Cache
  type CacheHitHookContext,
  type CacheMissHookContext,

  // 扩展上下文 - Timeout and Health
  type TimeoutApiHookContext,
  type TimeoutExecutionHookContext,
  type TimeoutStalledHookContext,
  type HealthHeartbeatHookContext,

  // 类型映射
  type HookTypeMap,
  type HookType,

  // 处理器
  type HookHandler,
  type HookOptions,
  type RegisteredHook,

  // 执行追踪
  type HookExecutionLog,
  type ExecutionTrackingOptions,
} from './types.js';

// 导出注册表
export { HookRegistry } from './registry.js';

// 导出实现
export {
  // 安全检查
  SecurityHooks,
  createSecurityHooks,
  type SecurityHooksConfig,
  type DangerousCommandPattern,
  type SensitiveFilePattern,

  // 监控
  MonitoringHooks,
  createMonitoringHooks,
  type MonitoringHooksConfig,
  type ToolCallStats,
  type SessionStats,
  type PerformanceAlert,

  // 审计
  AuditHooks,
  createAuditHooks,
  type AuditHooksConfig,
  type AuditLogEntry,
  type AuditLogLevel,

  // 限流熔断
  RateLimiterHooks,
  createRateLimiterHooks,
  type RateLimiterHooksConfig,
  type RateLimitConfig,
  type CircuitBreakerConfig,
  type CircuitState,
} from './implementations/index.js';
