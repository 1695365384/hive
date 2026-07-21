/**
 * Coordinator discipline helpers — audit continuation / blocked actions.
 */

import type { CompletionVerifyResult, TaskProgressAction, TaskProgressEvent } from './types.js';

export const MAX_AUDIT_CONTINUES = 1;

export function collectFailureReasons(verification: CompletionVerifyResult): string[] {
  return verification.results.filter((r) => !r.passed).map((r) => r.message);
}

export function isRetryableFailure(verification: CompletionVerifyResult): boolean {
  const failed = verification.results.filter((r) => !r.passed);
  if (failed.length === 0) return false;
  return failed.every((r) => r.retryable !== false);
}

export function buildContinuationPrompt(
  task: string,
  reasons: string[],
  priorOutput: string,
): string {
  const reasonBlock = reasons.map((r, i) => `${i + 1}. ${r}`).join('\n');
  const excerpt = priorOutput.trim().slice(0, 1200);
  return [
    'The previous attempt did NOT pass the completion audit. Fix ONLY the specific issues below — do NOT restart from scratch.',
    '',
    `Original task:\n${task}`,
    '',
    `What needs fixing:\n${reasonBlock || '1. Deliver the final Office file via send-file'}`,
    '',
    'Instructions:',
    '- Read the specific audit failure above and fix ONLY those issues.',
    '- If slide count is wrong: add or remove slides, then re-validate and send-file.',
    '- If chart/media is missing: add the chart/picture, then re-validate and send-file.',
    '- If layout overlaps: fix the overlapping shapes using layout slots, re-validate, then send-file.',
    '- If file not delivered: call send-file on the final .pptx/.docx/.xlsx.',
    '- Do NOT recreate the entire document.',
    '',
    excerpt ? `Previous output (excerpt):\n${excerpt}` : '',
    '',
    'Fix the issues now. Send-file when done.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function blockedActions(): TaskProgressAction[] {
  return [
    { id: 'continue', label: '继续完成' },
    { id: 'provide-info', label: '补充信息' },
    { id: 'cancel', label: '取消' },
  ];
}

export function mapWorkflowPhaseToTaskProgress(
  phase: string,
  message: string,
): TaskProgressEvent | null {
  switch (phase) {
    case 'start':
    case 'understand':
      return { phase: 'understand', message };
    case 'plan':
      return { phase: 'plan', message };
    case 'execute':
      return { phase: 'execute', message };
    case 'verify':
      return { phase: 'verify', message };
    case 'complete':
      if (/失败|未完成|fail|error/i.test(message)) {
        return { phase: 'blocked', message, actions: blockedActions(), reasons: [message] };
      }
      return { phase: 'done', message: '文档就绪，可以预览了' };
    case 'error':
      return { phase: 'blocked', message, actions: blockedActions(), reasons: [message] };
    default:
      return null;
  }
}
