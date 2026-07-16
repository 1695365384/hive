import { describe, it, expect } from 'vitest';
import { decideWorkerFinalizations } from '../../../src/agents/completion/office-worker-finalize.js';

describe('decideWorkerFinalizations', () => {
  const open = [{ workerId: 'w1', workerType: 'office' }];

  it('heartbeat → failed', () => {
    expect(decideWorkerFinalizations(open, { reason: 'heartbeat_timeout' })).toEqual([
      { workerId: 'w1', workerType: 'office', success: false, error: 'heartbeat_timeout' },
    ]);
  });

  it('turn error → failed', () => {
    expect(
      decideWorkerFinalizations(open, { reason: 'turn_end', turnError: 'boom' }),
    ).toEqual([
      { workerId: 'w1', workerType: 'office', success: false, error: 'boom' },
    ]);
  });

  it('artifact present → success', () => {
    expect(
      decideWorkerFinalizations(open, { reason: 'turn_end', hasOfficeArtifact: true }),
    ).toEqual([{ workerId: 'w1', workerType: 'office', success: true }]);
  });

  it('no artifact → incomplete', () => {
    expect(decideWorkerFinalizations(open, { reason: 'turn_end' })).toEqual([
      { workerId: 'w1', workerType: 'office', success: false, error: 'incomplete' },
    ]);
  });
});
