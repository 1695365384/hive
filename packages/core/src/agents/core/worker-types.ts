/**
 * Coordinator 可派发的 Worker 类型（单一事实来源）
 *
 * agent-tool schema、coordinator.md、契约测试均应对齐此列表。
 * critic / arbiter 仅用于 AdversarialHarness，不可通过 agent() 委派。
 */

export const DELEGATABLE_WORKER_TYPES = [
  'explore',
  'plan',
  'general',
  'schedule',
  'office',
] as const;

export type DelegatableWorkerType = (typeof DELEGATABLE_WORKER_TYPES)[number];

export function isDelegatableWorkerType(value: string): value is DelegatableWorkerType {
  return (DELEGATABLE_WORKER_TYPES as readonly string[]).includes(value);
}
