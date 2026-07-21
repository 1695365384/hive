/**
 * Completion discipline helpers
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_AUDIT_CONTINUES,
  collectFailureReasons,
  isRetryableFailure,
  buildContinuationPrompt,
  blockedActions,
  mapWorkflowPhaseToTaskProgress,
} from '../../../src/agents/completion/discipline.js';

describe('discipline helpers', () => {
  it('exposes a limited continue budget', () => {
    expect(MAX_AUDIT_CONTINUES).toBe(1);
  });

  it('collects failure reasons', () => {
    const reasons = collectFailureReasons({
      passed: false,
      results: [
        { verifierId: 'generic', passed: false, message: 'promise only' },
        { verifierId: 'office', passed: true, message: 'ok' },
      ],
    });
    expect(reasons).toEqual(['promise only']);
  });

  it('treats undefined retryable as retryable', () => {
    expect(
      isRetryableFailure({
        passed: false,
        results: [{ verifierId: 'x', passed: false, message: 'fail' }],
      }),
    ).toBe(true);
  });

  it('honors explicit non-retryable failures', () => {
    expect(
      isRetryableFailure({
        passed: false,
        results: [
          { verifierId: 'x', passed: false, message: 'need user', retryable: false },
        ],
      }),
    ).toBe(false);
  });

  it('builds a continuation prompt with audit failures', () => {
    const prompt = buildContinuationPrompt(
      '实现登录页',
      ['promise instead of delivery'],
      '我会马上开始。',
    );
    expect(prompt).toContain('实现登录页');
    expect(prompt).toContain('promise instead of delivery');
    expect(prompt).toContain('Fix ONLY the specific issues below');
  });

  it('returns blocked actions', () => {
    expect(blockedActions().map((a) => a.id)).toEqual([
      'continue',
      'provide-info',
      'cancel',
    ]);
  });

  it('maps workflow phases to task progress', () => {
    expect(mapWorkflowPhaseToTaskProgress('understand', '理解任务')?.phase).toBe(
      'understand',
    );
    expect(mapWorkflowPhaseToTaskProgress('complete', 'done')?.phase).toBe('done');
    expect(mapWorkflowPhaseToTaskProgress('error', 'boom')?.phase).toBe('blocked');
  });
});
