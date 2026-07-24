/**
 * 可委派 Worker 类型（兼容旧测试 / Vertical Pack）
 *
 * AgentLoop 架构下，主循环通过 `task` 工具动态 spawn subagent，
 * 不再依赖这些预定义类型做路由。列表仍保留供 TaskManager / runner 兼容。
 */

export const DELEGATABLE_WORKER_TYPES = [
  'explore',
  'plan',
  'general',
  'schedule',
  'office',
  'librarian',
  'metis',
  'momus',
  'oracle',
  'task',
] as const;

export type DelegatableWorkerType = (typeof DELEGATABLE_WORKER_TYPES)[number];

export function isDelegatableWorkerType(value: string): value is DelegatableWorkerType {
  return (DELEGATABLE_WORKER_TYPES as readonly string[]).includes(value);
}
