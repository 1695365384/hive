/**
 * Hooks 实现模块
 *
 * 提供企业级 Hooks 实现
 */

// 安全检查 Hooks
export {
  SecurityHooks,
  createSecurityHooks,
  type SecurityHooksConfig,
  type DangerousCommandPattern,
  type SensitiveFilePattern,
} from './SecurityHooks.js';

// 监控 Hooks
export {
  MonitoringHooks,
  createMonitoringHooks,
  type MonitoringHooksConfig,
  type ToolCallStats,
  type SessionStats,
  type PerformanceAlert,
} from './MonitoringHooks.js';

// 审计 Hooks
export {
  AuditHooks,
  createAuditHooks,
  type AuditHooksConfig,
  type AuditLogEntry,
  type AuditLogLevel,
} from './AuditHooks.js';

// 限流熔断 Hooks
export {
  RateLimiterHooks,
  createRateLimiterHooks,
  type RateLimiterHooksConfig,
  type RateLimitConfig,
  type CircuitBreakerConfig,
  type CircuitState,
} from './RateLimiterHooks.js';
