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

    if (!routedTypes.includes('schedule')) {
      return {
        verifierId: 'schedule',
        passed: false,
        message: 'Schedule task did not spawn a schedule Worker (expected agent type "schedule").',
      };
    }

    return {
      verifierId: 'schedule',
      passed: true,
      message: 'Schedule Worker spawned successfully.',
    };
  },
};
