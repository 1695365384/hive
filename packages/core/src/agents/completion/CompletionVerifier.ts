/**
 * 任务完成判定服务
 */

import { officeCompletionVerifier } from './verifiers/office.js';
import { scheduleCompletionVerifier } from './verifiers/schedule.js';
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
];

export class CompletionVerifierService {
  private verifiers: CompletionVerifier[];

  constructor(options?: CompletionVerifierOptions) {
    this.verifiers = options?.verifiers ?? DEFAULT_VERIFIERS;
  }

  async verify(trace: TaskTrace): Promise<CompletionVerifyResult> {
    const matched = this.verifiers.filter(v => v.match(trace));
    if (matched.length === 0) {
      return { passed: true, results: [] };
    }

    const results: VerifyResult[] = [];
    for (const verifier of matched) {
      results.push(await verifier.verify(trace));
    }

    return {
      passed: results.every(r => r.passed),
      results,
    };
  }
}

export function createCompletionVerifierService(
  options?: CompletionVerifierOptions,
): CompletionVerifierService {
  return new CompletionVerifierService(options);
}
