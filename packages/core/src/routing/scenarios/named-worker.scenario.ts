/**
 * Named Worker 场景 — 用户显式点名 Worker 类型时硬路由
 *
 * 例：「请用 librarian 查 …」「use metis to …」
 * 优先级高于 office/schedule，避免 prompt-only 时被 explore 顶替。
 */

import type { DelegatableWorkerType } from '../../agents/core/worker-types.js';
import { isDelegatableWorkerType } from '../../agents/core/worker-types.js';
import type { ScenarioCopy, ScenarioDefinition, WorkerSpawnInput } from '../types.js';

export const NAMED_WORKER_SCENARIO_ID = 'named-worker' as const;

/** 需要硬路由的专家 Worker（用户最容易点名却被 explore 顶替的） */
const HARD_ROUTE_WORKERS = [
  'librarian',
  'metis',
  'momus',
  'oracle',
  'explore',
  'plan',
  'general',
  'office',
  'schedule',
] as const satisfies readonly DelegatableWorkerType[];

const TYPE_ALT = HARD_ROUTE_WORKERS.join('|');

/**
 * Explicit naming patterns, e.g.:
 * - 请用 librarian / 使用 metis / 走 oracle
 * - use librarian / via metis / with oracle worker
 * - agent(type="librarian") / type=momus
 */
const NAMED_WORKER_RE = new RegExp(
  [
    // 中文点名
    String.raw`(?:请|麻烦)?(?:用|使用|走|派|调用|让)\s*(?:一下)?\s*(?:agent\s*)?(?:type\s*=\s*)?[\`"']?(${TYPE_ALT})[\`"']?`,
    // 英文点名
    String.raw`\b(?:use|via|with|through|call|run|spawn)\s+(?:the\s+)?(?:agent\s*(?:tool\s*)?(?:with\s+)?)?(?:type\s*=\s*)?[\`"']?(${TYPE_ALT})[\`"']?(?:\s+worker)?\b`,
    // schema 风格
    String.raw`\b(?:agent\s*)?\(\s*type\s*=\s*[\`"']?(${TYPE_ALT})[\`"']?`,
    String.raw`\btype\s*=\s*[\`"']?(${TYPE_ALT})[\`"']?`,
    // 「librarian 查/检索…」开头式点名
    String.raw`(?:^|[\s，,：:])(${TYPE_ALT})\s*(?:worker\s*)?(?:查|检索|搜索|调研|分析|审查|诊断|帮)`,
  ].join('|'),
  'i',
);

export const NAMED_WORKER_SCENARIO_LABELS = {
  scenario: '指定 Worker',
  workerRunning: '正在按指定 Worker 执行',
  workerDescription: '按用户点名的 Worker 类型执行',
  inquiryNotification: '指定 Worker',
  creationNotification: '指定 Worker 执行',
} as const;

const NAMED_WORKER_HINT = [
  '## MANDATORY Routing (Named Worker)',
  '',
  'The user explicitly named a Worker type.',
  '- You MUST call agent() with that exact type on first dispatch.',
  '- Do NOT silently substitute explore for librarian/metis/momus/oracle.',
].join('\n');

export const namedWorkerScenarioCopy: ScenarioCopy = {
  inquiryReply() {
    return '';
  },
  routingHint() {
    return NAMED_WORKER_HINT;
  },
  coordinatorBlurb(task: string) {
    const type = detectNamedWorkerType(task);
    if (!type) return null;
    return (
      `[Named Worker] User explicitly requested type="${type}". `
      + `First agent() dispatch MUST use type="${type}" — do not substitute explore.`
    );
  },
};

export function detectNamedWorkerType(task: string): DelegatableWorkerType | null {
  const match = NAMED_WORKER_RE.exec(task);
  if (!match) return null;
  const raw = match.slice(1).find(Boolean)?.toLowerCase();
  if (!raw || !isDelegatableWorkerType(raw)) return null;
  return raw;
}

export function matchesNamedWorkerScenario(task: string): boolean {
  return detectNamedWorkerType(task) !== null;
}

export function buildNamedWorkerSpawn(
  task: string,
  type?: DelegatableWorkerType,
  description?: string,
): WorkerSpawnInput {
  const workerType = type ?? detectNamedWorkerType(task);
  if (!workerType) {
    throw new Error('named worker type is required');
  }
  return {
    type: workerType,
    prompt: task,
    description: description ?? `按用户指定使用 ${workerType} Worker`,
    scenarioId: NAMED_WORKER_SCENARIO_ID,
  };
}

function namedWorkerValidationError(expected: string, actual: string): string {
  return [
    'Status: FAILED',
    `Worker type "${actual}" is NOT allowed — user explicitly requested "${expected}".`,
    `You MUST retry with agent(type="${expected}", prompt="...").`,
    'Do NOT silently substitute explore for librarian/metis/momus/oracle.',
  ].join('\n');
}

export const namedWorkerScenario: ScenarioDefinition = {
  id: NAMED_WORKER_SCENARIO_ID,
  /** Higher than office(100)/schedule(90) so explicit naming wins */
  priority: 200,
  labels: NAMED_WORKER_SCENARIO_LABELS,
  copy: namedWorkerScenarioCopy,
  allowedWorkers: HARD_ROUTE_WORKERS,
  match: matchesNamedWorkerScenario,
  resolve(task: string) {
    const type = detectNamedWorkerType(task);
    if (!type) return { kind: 'none' };
    return {
      kind: 'delegate',
      spawns: [buildNamedWorkerSpawn(task, type)],
    };
  },
  validateSpawn(task, spawn) {
    const expected = detectNamedWorkerType(task);
    if (!expected) return null;
    if (spawn.type !== expected) {
      return namedWorkerValidationError(expected, spawn.type);
    }
    return null;
  },
};
