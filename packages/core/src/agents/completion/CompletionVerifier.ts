/**
 * 任务完成判定服务
 */

import { officeCompletionVerifier } from './verifiers/office.js';
import { scheduleCompletionVerifier } from './verifiers/schedule.js';
import { genericCompletionVerifier } from './verifiers/generic.js';
import type {
  CompletionVerifier,
  CompletionVerifierOptions,
  CompletionVerifyResult,
  TaskTrace,
  VerifyResult,
} from './types.js';

const DEFAULT_VERIFIERS: CompletionVerifier[] = [
  officeCompletionVerifier,
  scheduleCompletionVerifier,
  genericCompletionVerifier,
];

export class CompletionVerifierService {
  private verifiers: CompletionVerifier[];

  constructor(options?: CompletionVerifierOptions) {
    this.verifiers = options?.verifiers ?? DEFAULT_VERIFIERS;
  }

  async verify(trace: TaskTrace): Promise<CompletionVerifyResult> {
    const specialized = this.verifiers.filter(
      (v) => v.id !== 'generic' && v.match(trace),
    );

    // Prefer scenario verifiers when they match; otherwise fall back to generic.
    let toRun = specialized;
    if (toRun.length === 0) {
      const generic = this.verifiers.find((v) => v.id === 'generic' && v.match(trace));
      toRun = generic ? [generic] : [];
    }

    if (toRun.length === 0) {
      return { passed: true, results: [] };
    }

    const results: VerifyResult[] = [];
    for (const verifier of toRun) {
      results.push(await verifier.verify(trace));
    }

    return {
      passed: results.every((r) => r.passed),
      results,
    };
  }
}

export function createCompletionVerifierService(
  options?: CompletionVerifierOptions,
): CompletionVerifierService {
  return new CompletionVerifierService(options);
}
