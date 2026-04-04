/**
 * CheckpointRepository 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MigrationRunner } from '../../src/storage/MigrationRunner.js';
import '../../src/storage/migrations/index.js';
import { CheckpointRepository } from '../../src/storage/CheckpointRepository.js';

describe('CheckpointRepository', () => {
  let db: Database.Database;
  let repository: CheckpointRepository;

  beforeEach(async () => {
    db = new Database(':memory:');
    const runner = new MigrationRunner(db);
    await runner.runPending();
    repository = new CheckpointRepository(db);
  });

  it('creates checkpoint in pending phase', () => {
    const row = repository.createOrGet('s1', 'wf1', 'h1');

    expect(row.sessionId).toBe('s1');
    expect(row.workflowId).toBe('wf1');
    expect(row.phase).toBe('pending');
    expect(row.retryCount).toBe(0);
  });

  it('returns existing checkpoint for same workflow', () => {
    const first = repository.createOrGet('s1', 'wf1', 'h1');
    const second = repository.createOrGet('s1', 'wf1', 'h1');

    expect(second.id).toBe(first.id);
  });

  it('updates execute checkpoint data', () => {
    repository.createOrGet('s1', 'wf1', 'h1');
    repository.completePhase('wf1', 'execute', { task: 'T', partialText: 'partial' });

    const row = repository.findByWorkflowId('wf1');
    expect(row?.phase).toBe('execute');
    expect(row?.checkpointData).toContain('partial');
  });

  it('marks failed and increments retry', () => {
    repository.createOrGet('s1', 'wf1', 'h1');
    repository.incrementRetry('wf1');
    repository.markFailed('wf1', 'boom');

    const row = repository.findByWorkflowId('wf1');
    expect(row?.phase).toBe('failed');
    expect(row?.retryCount).toBe(1);
    expect(row?.lastError).toBe('boom');
  });

  it('marks completed with final payload', () => {
    repository.createOrGet('s1', 'wf1', 'h1');
    repository.markCompleted('wf1', { task: 'T', finalText: 'done', tools: ['agent'] });

    const row = repository.findByWorkflowId('wf1');
    expect(row?.phase).toBe('completed');
    expect(row?.checkpointData).toContain('done');
  });

  it('findLatestByTask returns null when not found', () => {
    const row = repository.findLatestByTask('s1', 'none');
    expect(row).toBeNull();
  });
});
