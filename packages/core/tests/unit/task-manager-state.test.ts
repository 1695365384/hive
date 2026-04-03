/**
 * P1.1: Worker 状态机测试
 */

import { describe, it, expect } from 'vitest';
import { TaskManager } from '../../src/agents/core/TaskManager.js';

describe('TaskManager — state machine', () => {
  it('registers worker with running status', () => {
    const tm = new TaskManager();
    tm.register('w1', 'explore', 'test task');
    expect(tm.getWorkerStatus('w1')).toBe('running');
  });

  it('transitions to success on unregister', () => {
    const tm = new TaskManager();
    tm.register('w1', 'explore');
    // Status should be running while active
    expect(tm.getWorkerStatus('w1')).toBe('running');
    tm.unregister('w1');
    // After unregister, worker is removed from active map
    expect(tm.getWorkerStatus('w1')).toBeUndefined();
    expect(tm.isActive('w1')).toBe(false);
  });

  it('transitions to cancelled on abort', () => {
    const tm = new TaskManager();
    tm.register('w1', 'general');
    const aborted = tm.abort('w1');
    expect(aborted).toBe(true);
    expect(tm.isActive('w1')).toBe(false);
  });

  it('abort returns false for unknown worker', () => {
    const tm = new TaskManager();
    expect(tm.abort('nonexistent')).toBe(false);
  });

  it('abortAll clears all workers', () => {
    const tm = new TaskManager();
    tm.register('w1', 'explore');
    tm.register('w2', 'plan');
    tm.register('w3', 'general');
    expect(tm.activeCount).toBe(3);
    tm.abortAll();
    expect(tm.activeCount).toBe(0);
  });

  it('tracks peak concurrent correctly', () => {
    const tm = new TaskManager();
    tm.register('w1', 'explore');
    tm.register('w2', 'plan');
    tm.register('w3', 'general');
    expect(tm.peakConcurrent).toBe(3);
    tm.unregister('w1');
    tm.unregister('w2');
    expect(tm.peakConcurrent).toBe(3); // peak doesn't decrease
    tm.register('w4', 'general');
    expect(tm.peakConcurrent).toBe(3); // still 3, not 4
  });

  it('waitFor resolves immediately for unknown worker', async () => {
    const tm = new TaskManager();
    let resolved = false;
    const p = tm.waitFor('nonexistent').then(() => { resolved = true; });
    await p;
    expect(resolved).toBe(true);
  });

  it('waitFor resolves when worker is unregistered', async () => {
    const tm = new TaskManager();
    tm.register('w1', 'explore');
    let resolved = false;
    const p = tm.waitFor('w1').then(() => { resolved = true; });
    expect(resolved).toBe(false);
    tm.unregister('w1');
    await p;
    expect(resolved).toBe(true);
  });

  it('waitFor resolves when worker is aborted', async () => {
    const tm = new TaskManager();
    tm.register('w1', 'explore');
    let resolved = false;
    const p = tm.waitFor('w1').then(() => { resolved = true; });
    tm.abort('w1');
    await p;
    expect(resolved).toBe(true);
  });

  it('waitFor resolves via external abort signal', async () => {
    const tm = new TaskManager();
    tm.register('w1', 'explore');
    const external = new AbortController();
    let resolved = false;
    const p = tm.waitFor('w1', external.signal).then(() => { resolved = true; });
    expect(resolved).toBe(false);
    external.abort();
    await p;
    expect(resolved).toBe(true);
  });
});
