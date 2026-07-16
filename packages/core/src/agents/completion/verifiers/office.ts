/**
 * Office 文档任务完成判定
 */

import { access } from 'node:fs/promises';
import { isOfficeDocumentPath } from '../../../artifacts/artifact-detector.js';
import { isOfficeTask } from '../../../routing/scenarios/office.scenario.js';
import type { CompletionVerifier, TaskTrace, VerifyResult } from '../types.js';
import { getAgentWorkerTypes, getSpawnedWorkerTypes } from '../TaskTrace.js';
import { extractExpectedSlideCount, inspectPptxZip } from '../office-slide-count.js';
import {
  FAKE_CHART_PREFIX,
  LAYOUT_ISSUES_PREFIX,
  findLayoutIssueInTrace,
  hasDataVisualIntent,
  isSimpleOfficeDeck,
} from '../office-visual-contract.js';

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
      const zip = await inspectPptxZip(pptx);
      const actual = zip.ok ? zip.slideCount : null;
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

      // Explicit ≤3-page text decks: skip FAKE_CHART (isSimpleOfficeDeck).
      // Data/diagram decks still require real chart/media.
      if (!isSimpleOfficeDeck(trace.task) && hasDataVisualIntent(trace.task)) {
        if (!zip.ok) {
          return {
            verifierId: 'office',
            passed: false,
            message:
              `${FAKE_CHART_PREFIX} Could not inspect ${pptx} for charts/media. `
              + 'Ensure the file is a valid pptx with a real chart or picture, then send-file again.',
          };
        }
        if (!(zip.hasChart || zip.hasMedia)) {
          return {
            verifierId: 'office',
            passed: false,
            message:
              `${FAKE_CHART_PREFIX} Data/visual task requires a real chart (ppt/charts) or embedded picture (ppt/media). `
              + 'Do not use colored rectangles as fake bars. Add chart or SVG/PNG via picture, then send-file.',
          };
        }
      }

      const layoutHit = findLayoutIssueInTrace(trace);
      if (layoutHit) {
        return {
          verifierId: 'office',
          passed: false,
          message:
            `${LAYOUT_ISSUES_PREFIX} Layout problem detected in officecli view output (${layoutHit}). `
            + 'Fix overlapping shapes using layout slots, re-run view, then send-file.',
        };
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
