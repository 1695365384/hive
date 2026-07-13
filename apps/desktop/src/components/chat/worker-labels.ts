/**
 * Worker / 场景用户可见标签（不暴露内部 agent type）
 *
 * scenario 标签与 core routing 契约对齐 — 见 packages/core/tests/contracts/scenario-labels.contract.test.ts
 */

const WORKER_TYPE_LABELS: Record<string, string> = {
  office: 'Office 文档',
  explore: '探索',
  plan: '规划',
  general: '执行',
  schedule: '定时任务',
};

/** 与 @bundy-lmw/hive-core routing 保持同步（契约测试锁死） */
const SCENARIO_LABELS: Record<string, string> = {
  'office-document': 'Office 文档',
  'recurring-task': '定时任务',
};

/** 折叠块标题：优先 description，其次 scenario，最后 workerType 映射 */
export function formatWorkerTitle(workerType: string, description?: string, scenarioId?: string): string {
  if (description?.trim()) {
    return description.trim();
  }
  if (scenarioId) {
    const scenarioLabel = formatScenarioLabel(scenarioId);
    if (scenarioLabel) return scenarioLabel;
  }
  return WORKER_TYPE_LABELS[workerType] ?? workerType;
}

export function formatScenarioLabel(scenarioId?: string): string | undefined {
  if (!scenarioId) return undefined;
  return SCENARIO_LABELS[scenarioId] ?? scenarioId;
}

/** 供契约测试：Desktop 侧 label map */
export function getDesktopScenarioLabels(): Record<string, string> {
  return { ...SCENARIO_LABELS };
}
