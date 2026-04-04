/**
 * WorkflowCheckpointCapability 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MigrationRunner } from '../../src/storage/MigrationRunner.js';
import '../../src/storage/migrations/index.js';
import { CheckpointRepository } from '../../src/storage/CheckpointRepository.js';
import {
  WorkflowCheckpointCapability,
  buildTaskHash,
} from '../../src/agents/capabilities/WorkflowCheckpointCapability.js';
import { createMockAgentContext } from '../mocks/agent-context.mock.js';

describe('WorkflowCheckpointCapability', () => {
  let db: Database.Database;
  let repository: CheckpointRepository;
  let capability: WorkflowCheckpointCapability;

  beforeEach(async () => {
    db = new Database(':memory:');
    const runner = new MigrationRunner(db);
    await runner.runPending();
    repository = new CheckpointRepository(db);
    capability = new WorkflowCheckpointCapability({ repository, maxRetries: 3 });
    capability.initialize(createMockAgentContext());
  });

  it('starts workflow with deterministic id', () => {
    const row = capability.startWorkflow('s1', 'Build feature A');

    expect(row.sessionId).toBe('s1');
    expect(row.workflowId).toContain('wf_s1_');
  });

  it('returns resume info for failed workflow under retry limit', () => {
    const row = capability.startWorkflow('s1', 'Build feature A');
    capability.markExecute(row.workflowId, { task: 'Build feature A', partialText: 'halfway' });
    capability.markFailed(row.workflowId, 'network error', { task: 'Build feature A', partialText: 'halfway' });

    const resume = capability.canResume('s1', 'Build feature A');
    expect(resume).not.toBeNull();
    expect(resume?.phase).toBe('failed');
    expect(resume?.data?.partialText).toBe('halfway');
  });

  it('returns completed resume info with final text', () => {
    const row = capability.startWorkflow('s1', 'Build feature A');
    capability.markCompleted(row.workflowId, { task: 'Build feature A', finalText: 'done', tools: ['agent'] });

    const resume = capability.canResume('s1', 'Build feature A');
    expect(resume?.phase).toBe('completed');
    expect(resume?.data?.finalText).toBe('done');
  });

  it('returns null when retry limit reached', () => {
    const row = capability.startWorkflow('s1', 'Build feature A');
    capability.markFailed(row.workflowId, 'err1');
    capability.markFailed(row.workflowId, 'err2');
    capability.markFailed(row.workflowId, 'err3');

    const resume = capability.canResume('s1', 'Build feature A');
    expect(resume).toBeNull();
  });

  it('buildTaskHash is stable and case-insensitive', () => {
    const a = buildTaskHash('s1', ' Build Feature A ');
    const b = buildTaskHash('s1', 'build feature a');
    expect(a).toBe(b);
  });
});
