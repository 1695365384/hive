/**
 * Office 文档任务完成判定
 */

import { access } from 'node:fs/promises';
import { isOfficeTask } from '../../../routing/scenarios/office.scenario.js';
import type { CompletionVerifier, TaskTrace, VerifyResult } from '../types.js';
import { getAgentWorkerTypes, getSpawnedWorkerTypes } from '../TaskTrace.js';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export const officeCompletionVerifier: CompletionVerifier = {
  id: 'office',

  match(trace: TaskTrace): boolean {
    return isOfficeTask(trace.task);
  },

  async verify(trace: TaskTrace): Promise<VerifyResult> {
    const routedTypes = [...getAgentWorkerTypes(trace), ...getSpawnedWorkerTypes(trace)];

    if (!routedTypes.includes('office')) {
      return {
        verifierId: 'office',
        passed: false,
        message: 'Office document task did not spawn an office Worker (expected agent type "office").',
      };
    }

    if (trace.artifacts.length === 0) {
      return {
        verifierId: 'office',
        passed: true,
        message: 'Office Worker spawned; no artifact path detected in outputs (route check passed).',
      };
    }

    for (const artifact of trace.artifacts) {
      if (!(await fileExists(artifact))) {
        return {
          verifierId: 'office',
          passed: false,
          message: `Office artifact not found on disk: ${artifact}`,
        };
      }
    }

    return {
      verifierId: 'office',
      passed: true,
      message: `Office task verified (${trace.artifacts.length} artifact(s) present).`,
    };
  },
};
