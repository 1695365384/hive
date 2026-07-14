/**
 * Office 文档任务完成判定
 */

import { access } from 'node:fs/promises';
import { isOfficeDocumentPath } from '../../../artifacts/artifact-detector.js';
import { isOfficeTask } from '../../../routing/scenarios/office.scenario.js';
import type { CompletionVerifier, TaskTrace, VerifyResult } from '../types.js';
import { getAgentWorkerTypes, getSpawnedWorkerTypes } from '../TaskTrace.js';
import { countPptxSlides, extractExpectedSlideCount } from '../office-slide-count.js';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function officeDocuments(trace: TaskTrace): string[] {
  return trace.artifacts.filter(isOfficeDocumentPath);
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

    const docs = officeDocuments(trace);
    if (docs.length === 0) {
      return {
        verifierId: 'office',
        passed: false,
        message:
          'Office Worker finished but no .pptx/.docx/.xlsx was delivered to chat. '
          + 'Screenshots alone do not count — call send-file on the Office file.',
      };
    }

    for (const artifact of docs) {
      if (!(await fileExists(artifact))) {
        return {
          verifierId: 'office',
          passed: false,
          message: `Office artifact not found on disk: ${artifact}`,
        };
      }
    }

    const pptx = docs.find(a => a.toLowerCase().endsWith('.pptx'));
    if (pptx) {
      const actual = await countPptxSlides(pptx);
      const expected = extractExpectedSlideCount(trace.task);

      if (actual != null && actual < 2) {
        return {
          verifierId: 'office',
          passed: false,
          message: `PPT has only ${actual} slide(s); run officecli view outline and add slides before send-file.`,
        };
      }

      if (expected != null) {
        if (actual == null) {
          return {
            verifierId: 'office',
            passed: false,
            message: `Could not verify slide count for ${pptx}; run officecli view outline before send-file.`,
          };
        }
        if (actual !== expected) {
          return {
            verifierId: 'office',
            passed: false,
            message: `PPT slide count mismatch: user asked for ${expected} pages but file has ${actual} slides. Add missing slides before claiming completion.`,
          };
        }
      }

      if (actual != null) {
        return {
          verifierId: 'office',
          passed: true,
          message: `Office task verified: ${pptx} (${actual} slides).`,
        };
      }
    }

    return {
      verifierId: 'office',
      passed: true,
      message: `Office task verified (${docs.length} document artifact(s) present).`,
    };
  },
};
