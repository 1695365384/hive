/**
 * 定时任务场景 — 意图识别 + 路由 + 文案（单一来源）
 */

import type { ScenarioCopy, ScenarioDefinition, WorkerSpawnInput } from '../types.js';
import { pickLocalizedLines } from '../scenario-copy.js';

const SCHEDULE_TASK_RE =
  /(?:cron|schedule|scheduled|定时|每天|每周|每小时|recurring|remind(?:er)?|提醒)/i;

const SCHEDULE_INQUIRY_RE =
  /(能|可以|会不会|能不能|支持|会帮|could you|can you|do you)/i;

const SCHEDULE_CREATION_STRONG_RE =
  /(帮我|请|新建|创建|添加|create|set up|add|remind me|每天|每周|每小时)/i;

export function isScheduleTask(task: string): boolean {
  return SCHEDULE_TASK_RE.test(task);
}

function hasScheduleCreationIntent(
  task: string,
  ctx: { isQuestion: boolean; hasInquiryTone: boolean },
): boolean {
  if (/(帮我|请|remind me)/i.test(task)) return true;
  if ((ctx.isQuestion || ctx.hasInquiryTone) && !/(每天|每周|每小时)/i.test(task)) {
    return false;
  }
  if (SCHEDULE_CREATION_STRONG_RE.test(task)) return true;
  if (ctx.isQuestion || ctx.hasInquiryTone) return false;
  return false;
}

export function isScheduleCreationTask(task: string): boolean {
  if (!isScheduleTask(task)) return false;
  const trimmed = task.trim();
  const isQuestion = /[?？]|吗\s*$/.test(trimmed);
  const hasInquiryTone = SCHEDULE_INQUIRY_RE.test(task);
  return hasScheduleCreationIntent(task, { isQuestion, hasInquiryTone });
}

export function isScheduleInquiryTask(task: string): boolean {
  if (!isScheduleTask(task)) return false;
  const trimmed = task.trim();
  const isQuestion = /[?？]|吗\s*$/.test(trimmed);
  const hasInquiryTone = SCHEDULE_INQUIRY_RE.test(task);
  const hasCreationIntent = hasScheduleCreationIntent(task, { isQuestion, hasInquiryTone });
  return (isQuestion || hasInquiryTone) && !hasCreationIntent;
}

export const SCHEDULE_SCENARIO_ID = 'recurring-task' as const;

export const SCHEDULE_SCENARIO_LABELS = {
  scenario: '定时任务',
  workerRunning: '正在配置定时任务',
  workerDescription: '创建或管理 cron / 定时提醒',
  inquiryNotification: '定时能力咨询',
  creationNotification: '定时任务配置',
} as const;

const SCHEDULE_INQUIRY_LINES = {
  zh: [
    '可以。定时任务与 cron 提醒由专用 **schedule Worker** 处理，已集成在本系统中。',
    '',
    '直接告诉我：',
    '- 触发频率（每天 / 每周 / cron 表达式）',
    '- 执行内容或提醒事项',
    '',
    '我会立即帮你创建或管理定时任务。',
  ],
  en: [
    'Yes. Scheduled tasks and cron reminders are handled by the dedicated **schedule Worker**, which is already integrated.',
    '',
    'Tell me the frequency (daily / weekly / cron) and what to run or remind — I will set it up immediately.',
  ],
} as const;

const SCHEDULE_ROUTING_HINT = [
  '## MANDATORY Routing (Schedule Task)',
  '',
  'This user message is a **schedule/cron task**.',
  '- You MUST call agent() with type="schedule".',
  '- Do NOT use explore or general workers for scheduling.',
].join('\n');

export const scheduleScenarioCopy: ScenarioCopy = {
  inquiryReply(task: string) {
    return pickLocalizedLines(task, SCHEDULE_INQUIRY_LINES);
  },
  routingHint() {
    return SCHEDULE_ROUTING_HINT;
  },
};

export function getScheduleInquiryReply(task: string): string {
  return scheduleScenarioCopy.inquiryReply(task);
}

export function buildScheduleRoutingDirective(): string {
  return scheduleScenarioCopy.routingHint();
}

export function buildScheduleWorkerSpawn(task: string, description?: string): WorkerSpawnInput {
  return {
    type: 'schedule',
    prompt: task,
    description: description ?? SCHEDULE_SCENARIO_LABELS.workerDescription,
    scenarioId: SCHEDULE_SCENARIO_ID,
  };
}

function scheduleSpawnValidationError(workerType: string): string {
  return [
    `Status: FAILED`,
    `Worker type "${workerType}" is NOT allowed for schedule tasks.`,
    `You MUST retry with agent(type="schedule", prompt="...").`,
  ].join('\n');
}

export const scheduleScenario: ScenarioDefinition = {
  id: SCHEDULE_SCENARIO_ID,
  priority: 90,
  labels: SCHEDULE_SCENARIO_LABELS,
  copy: scheduleScenarioCopy,
  allowedWorkers: ['schedule'],
  match: isScheduleTask,
  resolve(task: string) {
    if (!isScheduleTask(task)) {
      return { kind: 'none' };
    }
    if (isScheduleInquiryTask(task)) {
      return { kind: 'inquiry', reply: scheduleScenarioCopy.inquiryReply(task) };
    }
    if (isScheduleCreationTask(task)) {
      return {
        kind: 'delegate',
        spawn: buildScheduleWorkerSpawn(task),
      };
    }
    return { kind: 'hint', directive: scheduleScenarioCopy.routingHint() };
  },
  validateSpawn(task, spawn) {
    if (!isScheduleTask(task)) return null;
    if (spawn.type !== 'schedule') {
      return scheduleSpawnValidationError(spawn.type);
    }
    return null;
  },
};
