/**
 * 可委派 Worker 类型（legacy / 兼容旧测试与 Vertical Pack）
 *
 * AgentLoop 主路径通过 pi 内置 `task` 工具动态 spawn subagent，
 * 不再依赖这些预定义类型做 Coordinator 路由。
 * 列表仍保留供 TaskManager、routing 单测与公有类型兼容；勿当作现行架构。
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
