/**
 * 内置场景注册
 */

import { ScenarioRegistry } from './ScenarioRegistry.js';
import { TaskRouter } from './TaskRouter.js';
import { officeScenario } from './scenarios/office.scenario.js';
import { scheduleScenario } from './scenarios/schedule.scenario.js';
import { namedWorkerScenario } from './scenarios/named-worker.scenario.js';

/** 构建含 Office + Schedule 的默认注册表 */
export function createDefaultScenarioRegistry(): ScenarioRegistry {
  return new ScenarioRegistry()
    .register(namedWorkerScenario)
    .register(officeScenario)
    .register(scheduleScenario);
}

/** 构建默认 TaskRouter */
export function createDefaultTaskRouter(): TaskRouter {
  return new TaskRouter(createDefaultScenarioRegistry());
}

/** 进程内默认单例（Coordinator / agent-tool 共用） */
export const defaultTaskRouter = createDefaultTaskRouter();

/** 场景 ID → 用户可见标签 */
export function getScenarioLabel(scenarioId: string): string | undefined {
  const scenario = defaultTaskRouter.getRegistry().getById(scenarioId);
  return scenario?.labels.scenario;
}

/** scenarioId → UI 标签（Desktop / 契约测试用） */
export function getAllScenarioLabels(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const scenario of defaultTaskRouter.getRegistry().list()) {
    map[scenario.id] = scenario.labels.scenario;
  }
  return map;
}

export function validateWorkerSpawn(task: string, spawn: import('./types.js').WorkerSpawnInput): string | null {
  return defaultTaskRouter.validateSpawn(task, spawn);
}
