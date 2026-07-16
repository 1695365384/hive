/**
 * Pure helpers for office worker terminal-state + progress (unit-testable).
 */

export type OpenWorker = { workerId: string; workerType: string };

export type FinalizeReason = 'turn_end' | 'heartbeat_timeout';

export interface FinalizeDecision {
  workerId: string;
  workerType: string;
  success: boolean;
  error?: string;
}

/**
 * Decide worker-complete payloads for workers still open at turn end / heartbeat.
 */
export function decideWorkerFinalizations(
  open: OpenWorker[],
  opts: {
    reason: FinalizeReason;
    turnError?: string;
    hasOfficeArtifact?: boolean;
  },
): FinalizeDecision[] {
  return open.map((w) => {
    if (opts.reason === 'heartbeat_timeout') {
      return {
        workerId: w.workerId,
        workerType: w.workerType,
        success: false,
        error: 'heartbeat_timeout',
      };
    }
    if (opts.turnError) {
      return {
        workerId: w.workerId,
        workerType: w.workerType,
        success: false,
        error: opts.turnError,
      };
    }
    if (opts.hasOfficeArtifact) {
      return { workerId: w.workerId, workerType: w.workerType, success: true };
    }
    return {
      workerId: w.workerId,
      workerType: w.workerType,
      success: false,
      error: 'incomplete',
    };
  });
}
