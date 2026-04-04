/**
 * ProgressCapability 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProgressCapability } from '../../src/agents/capabilities/ProgressCapability.js';
import { createMockAgentContext } from '../mocks/agent-context.mock.js';

describe('ProgressCapability', () => {
  let capability: ProgressCapability;
  let context: ReturnType<typeof createMockAgentContext>;

  beforeEach(() => {
    capability = new ProgressCapability();
    context = createMockAgentContext();
    capability.initialize(context);
  });

  it('starts with 0% progress', () => {
    capability.begin('task-1', 'desc', 'execute', 3);

    const snapshot = capability.getSnapshot();
    expect(snapshot.progress).toBe(0);
    expect(snapshot.phase).toBe('execute');
  });

  it('increments progress on each step', () => {
    capability.begin('task-1', 'desc', 'execute', 3);
    capability.step('a');

    let snapshot = capability.getSnapshot();
    expect(snapshot.progress).toBe(33);

    capability.step('b');
    snapshot = capability.getSnapshot();
    expect(snapshot.progress).toBe(67);
  });

  it('reaches 100% on complete', () => {
    capability.begin('task-1', 'desc', 'execute', 4);
    capability.complete('done');

    const snapshot = capability.getSnapshot();
    expect(snapshot.progress).toBe(100);
    expect(snapshot.currentStep).toBe('done');
  });

  it('returns null ETA before enough samples', () => {
    capability.begin('task-1', 'desc', 'execute', 3);
    capability.step('a');

    expect(capability.getETA()).toBeNull();
  });

  it('returns ETA after enough samples', async () => {
    capability.begin('task-1', 'desc', 'execute', 4);
    await new Promise((resolve) => setTimeout(resolve, 5));
    capability.step('a');
    await new Promise((resolve) => setTimeout(resolve, 5));
    capability.step('b');

    const eta = capability.getETA();
    expect(eta).not.toBeNull();
    expect(eta!).toBeGreaterThanOrEqual(0);
  });

  it('emits task:progress hook on updates', () => {
    capability.begin('task-1', 'desc', 'execute', 2);
    capability.step('step-1');

    const emits = vi.mocked(context.hookRegistry.emit).mock.calls;
    const progressEvents = emits.filter((item) => item[0] === 'task:progress');
    expect(progressEvents.length).toBeGreaterThan(0);
  });
});
