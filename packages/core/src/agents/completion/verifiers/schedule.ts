/**
 * 定时任务完成判定
 */

import type { CompletionVerifier, TaskTrace, VerifyResult } from '../types.js';
import { getAgentWorkerTypes, getSpawnedWorkerTypes } from '../TaskTrace.js';

const SCHEDULE_TASK_RE = /\b(cron|schedule|scheduled|定时|每天|每周|每小时|recurring|remind(?:er)?)\b/i;

export const scheduleCompletionVerifier: CompletionVerifier = {
  id: 'schedule',

  match(trace: TaskTrace): boolean {
    return SCHEDULE_TASK_RE.test(trace.task);
  },

  verify(trace: TaskTrace): VerifyResult {
    const routedTypes = [...getAgentWorkerTypes(trace), ...getSpawnedWorkerTypes(trace)];
    const hasScheduleWorker = routedTypes.includes('schedule');
    const hasScheduleTool = trace.toolCalls.some(
      (c) => c.toolName === 'schedule' || c.toolName.includes('schedule'),
    );

    if (!hasScheduleWorker && !hasScheduleTool) {
      return {
        verifierId: 'schedule',
        passed: false,
        message:
          'Schedule task finished without creating a schedule (expected schedule tool or schedule Worker).',
        retryable: true,
      };
    }

    return {
      verifierId: 'schedule',
      passed: true,
      message: hasScheduleWorker
        ? 'Schedule Worker spawned successfully.'
        : 'Schedule tool activity observed.',
    };
  },
};
