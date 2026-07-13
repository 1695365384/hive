/**
 * CompletionVerifier 单元测试
 */

import { describe, it, expect } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CompletionVerifierService } from '../../../src/agents/completion/CompletionVerifier.js';
import { officeCompletionVerifier } from '../../../src/agents/completion/verifiers/office.js';
import { scheduleCompletionVerifier } from '../../../src/agents/completion/verifiers/schedule.js';
import type { TaskTrace } from '../../../src/agents/completion/types.js';

function trace(overrides: Partial<TaskTrace>): TaskTrace {
  return {
    task: '',
    toolCalls: [],
    workerSpawns: [],
    artifacts: [],
    responseText: '',
    ...overrides,
  };
}

describe('officeCompletionVerifier', () => {
  it('matches office document tasks', () => {
    expect(officeCompletionVerifier.match(trace({ task: '做一个 PPT' }))).toBe(true);
    expect(officeCompletionVerifier.match(trace({ task: 'hello' }))).toBe(false);
  });

  it('fails when office worker was not spawned', async () => {
    const result = await officeCompletionVerifier.verify(trace({
      task: 'Create a PowerPoint deck',
      toolCalls: [{ toolName: 'agent', input: { type: 'general' } }],
    }));
    expect(result.passed).toBe(false);
    expect(result.message).toContain('office Worker');
  });

  it('passes when office worker spawned via agent tool', async () => {
    const result = await officeCompletionVerifier.verify(trace({
      task: 'Create a PPT',
      toolCalls: [{ toolName: 'agent', input: { type: 'office' } }],
    }));
    expect(result.passed).toBe(true);
  });

  it('fails when artifact path is missing on disk', async () => {
    const result = await officeCompletionVerifier.verify(trace({
      task: 'Create a PPT',
      workerSpawns: [{ workerType: 'office' }],
      artifacts: ['/tmp/definitely-missing-hive-test.pptx'],
    }));
    expect(result.passed).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('passes when artifact exists on disk', async () => {
    const dir = join(tmpdir(), `hive-completion-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'deck.pptx');
    await writeFile(file, 'fake');

    try {
      const result = await officeCompletionVerifier.verify(trace({
        task: 'Create a PPT',
        workerSpawns: [{ workerType: 'office' }],
        artifacts: [file],
      }));
      expect(result.passed).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('scheduleCompletionVerifier', () => {
  it('fails when schedule worker was not spawned', () => {
    const result = scheduleCompletionVerifier.verify(trace({
      task: '每天早上 9 点提醒我喝水',
      toolCalls: [{ toolName: 'agent', input: { type: 'general' } }],
    }));
    expect(result.passed).toBe(false);
  });

  it('passes when schedule worker spawned', () => {
    const result = scheduleCompletionVerifier.verify(trace({
      task: 'Set up a daily cron reminder',
      workerSpawns: [{ workerType: 'schedule' }],
    }));
    expect(result.passed).toBe(true);
  });
});

describe('CompletionVerifierService', () => {
  it('skips verifiers for unrelated tasks', async () => {
    const service = new CompletionVerifierService({
      verifiers: [officeCompletionVerifier, scheduleCompletionVerifier],
    });
    const result = await service.verify(trace({ task: '你好' }));
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(0);
  });
});
