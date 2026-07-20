/**
 * Coordinator discipline helpers — audit continuation / blocked actions.
 */

import type { CompletionVerifyResult, TaskProgressAction, TaskProgressEvent } from './types.js';

export const MAX_AUDIT_CONTINUES = 2;

export function collectFailureReasons(verification: CompletionVerifyResult): string[] {
  return verification.results.filter((r) => !r.passed).map((r) => r.message);
}

export function isRetryableFailure(verification: CompletionVerifyResult): boolean {
  const failed = verification.results.filter((r) => !r.passed);
  if (failed.length === 0) return false;
  // Default retryable unless any failure explicitly marks retryable=false
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
    'The previous attempt did NOT satisfy the completion audit. Continue the SAME task until it is actually done.',
    'Do not apologize. Do not claim completion until evidence exists (tools/workers/artifacts as required).',
    '',
    `Original task:\n${task}`,
    '',
    `Audit failures:\n${reasonBlock || '1. Incomplete delivery'}`,
    '',
    excerpt ? `Previous output (excerpt):\n${excerpt}` : '',
    '',
    'Continue now. Prefer spawning the right Worker / using tools over narrative promises.',
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
      return { phase: 'done', message };
    case 'error':
      return { phase: 'blocked', message, actions: blockedActions(), reasons: [message] };
    default:
      return null;
  }
}
