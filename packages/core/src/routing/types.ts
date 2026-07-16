/**
 * ScenarioRouter — 类型定义
 *
 * 术语（单一事实来源）：
 * - Agent: Hive.Agent 进程入口
 * - Worker: Coordinator 委派的执行单元 (explore/plan/general/office/schedule)
 * - Scenario: 用户可见能力包 (office-document, recurring-task)
 */

import type { DelegatableWorkerType } from '../agents/core/worker-types.js';

/** Coordinator → agent-tool 委派参数 */
export interface WorkerSpawnInput {
  type: DelegatableWorkerType;
  prompt: string;
  description?: string;
  scenarioId?: string;
  model?: string;
  maxTurns?: number;
}

/** UI / 通知文案 */
export interface ScenarioLabels {
  scenario: string;
  workerRunning: string;
  workerDescription: string;
  inquiryNotification: string;
  creationNotification: string;
}

/** 场景用户可见 / LLM 注入文案（与 labels 同文件维护） */
export interface ScenarioCopy {
  inquiryReply(task: string): string;
  routingHint(): string;
  /** match 时注入 Coordinator system prompt；null 表示不注入 */
  coordinatorBlurb?(task: string): string | null;
}

/** 可注册的场景定义 */
export interface ScenarioDefinition {
  id: string;
  /** 多场景 match 时，priority 高者优先 */
  priority: number;
  labels: ScenarioLabels;
  copy: ScenarioCopy;
  allowedWorkers: readonly DelegatableWorkerType[];
  match(task: string): boolean;
  resolve(task: string): ScenarioResolveResult;
  /** 返回错误信息；null 表示允许 spawn */
  validateSpawn?(task: string, spawn: WorkerSpawnInput): string | null;
}

/** 场景内部 resolve 结果 */
export type ScenarioResolveResult =
  | { kind: 'none' }
  | { kind: 'inquiry'; reply: string }
  | { kind: 'delegate'; spawns: WorkerSpawnInput[] }
  | { kind: 'hint'; directive: string };

/** TaskRouter 对 Coordinator 的输出 */
export type RouterDecision =
  | { action: 'pass' }
  | {
      action: 'inquiry';
      scenarioId: string;
      reply: string;
      notificationTitle: string;
    }
  | {
      action: 'delegate';
      scenarioId: string;
      /** ≥1；同 turn 多 spawn 时 Coordinator 并行执行 */
      spawns: WorkerSpawnInput[];
      notificationTitle: string;
      notificationBody: string;
    }
  | {
      action: 'hint';
      scenarioId: string;
      directive: string;
    };

/** 交付主 Worker：优先 office/schedule，否则取第一个 */
export function primaryDelegateSpawn(spawns: WorkerSpawnInput[]): WorkerSpawnInput {
  if (spawns.length === 0) {
    throw new Error('delegate spawns must not be empty');
  }
  return (
    spawns.find((s) => s.type === 'office' || s.type === 'schedule')
    ?? spawns[0]!
  );
}
