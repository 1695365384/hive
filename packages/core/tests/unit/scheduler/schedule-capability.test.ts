/**
 * ScheduleCapability 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../../src/storage/Database.js';
import { MigrationRunner } from '../../../src/storage/MigrationRunner.js';
import { ScheduleRepository } from '../../../src/storage/ScheduleRepository.js';
import { ScheduleCapability } from '../../../src/agents/capabilities/ScheduleCapability.js';
import type { IScheduleRepository, IScheduleEngine } from '../../../src/scheduler/types.js';
import type { AgentCapability } from '../../../src/agents/core/types.js';
// Import migrations to trigger registration
import '../../../src/storage/migrations/index.js';

function createMockAgentContext(): Record<string, unknown> {
  return {
    getCapability: vi.fn().mockReturnValue({
      send: vi.fn().mockResolvedValue('{"name":"日志检查","scheduleKind":"cron","cron":"0 9 * * *","prompt":"检查系统日志","action":"chat","needsConfirmation":false}'),
    }),
    hookRegistry: {
      getSessionId: vi.fn().mockReturnValue('session-1'),
      emit: vi.fn(),
    },
  };
}

describe('ScheduleCapability', () => {
  let db: Database.Database;
  let repo: IScheduleRepository;
  let cap: ScheduleCapability;
  let engine: IScheduleEngine;

  beforeEach(async () => {
    db = new Database(':memory:');
    const runner = new MigrationRunner(db);
    await runner.runPending();
    repo = new ScheduleRepository(db);

    // Mock engine
    engine = {
      start: vi.fn().mockResolvedValue(0),
      stop: vi.fn().mockResolvedValue(undefined),
      addTask: vi.fn(),
      pauseTask: vi.fn().mockReturnValue(true),
      resumeTask: vi.fn().mockResolvedValue(true),
      removeTask: vi.fn().mockReturnValue(true),
      getStatus: vi.fn().mockReturnValue({ running: true, registeredCount: 0, runningCount: 0, nextRuns: [] }),
    };

    cap = new ScheduleCapability();
    cap.setDependencies(repo, engine);
    cap.initialize(createMockAgentContext() as unknown as import('../../../src/agents/core/types.js').AgentContext);
  });

  // Cleanup handled by vi afterEach for DB

  it('should create a schedule via create()', async () => {
    const schedule = await cap.create({
      name: 'Test',
      cron: '0 9 * * *',
      prompt: 'Check logs',
    });

    expect(schedule.name).toBe('Test');
    expect(schedule.enabled).toBe(true);
    expect(engine.addTask).toHaveBeenCalled();
  });

  it('should create cron schedule directly', async () => {
    const schedule = await cap.create({
      name: 'Test',
      cron: '0 9 * * *',
      prompt: 'Check',
    });
    expect(schedule.name).toBe('Test');
    expect(schedule.scheduleKind).toBe('cron');
  });

  it('should list schedules', async () => {
    await cap.create({ name: 'Task 1', cron: '0 9 * * *', prompt: 'A' });
    await cap.create({ name: 'Task 2', cron: '0 10 * * *', prompt: 'B' });

    const result = await cap.list();
    expect(result).toContain('Task 1');
    expect(result).toContain('Task 2');
  });

  it('should return empty message when no schedules', async () => {
    const result = await cap.list();
    expect(result).toBe('暂无定时任务。');
  });

  it('should pause a schedule', async () => {
    const schedule = await cap.create({ name: 'Task', cron: '0 9 * * *', prompt: 'A' });
    const result = await cap.pause('Task');

    expect(result).toContain('已暂停');
    expect(engine.pauseTask).toHaveBeenCalledWith(schedule.id);
  });

  it('should resume a schedule', async () => {
    const schedule = await cap.create({ name: 'Task', cron: '0 9 * * *', prompt: 'A' });
    await cap.pause('Task');
    const result = await cap.resume('Task');

    expect(result).toContain('已恢复');
    expect(engine.resumeTask).toHaveBeenCalledWith(schedule.id);
  });

  it('should remove a schedule', async () => {
    const schedule = await cap.create({ name: 'Task', cron: '0 9 * * *', prompt: 'A' });
    const result = await cap.remove('Task');

    expect(result).toContain('已删除');
    expect(engine.removeTask).toHaveBeenCalledWith(schedule.id);

    const found = await repo.findById(schedule.id);
    expect(found).toBeNull();
  });

  it('should return not found for non-existent task', async () => {
    expect(await cap.pause('ghost')).toContain('未找到');
    expect(await cap.resume('ghost')).toContain('未找到');
    expect(await cap.remove('ghost')).toContain('未找到');
  });

  it('should show history', async () => {
    const schedule = await cap.create({ name: 'Task', cron: '0 9 * * *', prompt: 'A' });
    await repo.createRun({
      scheduleId: schedule.id,
      status: 'success',
      startedAt: new Date(),
      completedAt: new Date(),
      sessionId: 'sess-1',
    });

    const result = await cap.history('Task');
    expect(result).toContain('执行记录');
    expect(result).toContain('sess-1');
  });

  it('should show empty history when no runs', async () => {
    await cap.create({ name: 'Task', cron: '0 9 * * *', prompt: 'A' });
    const result = await cap.history('Task');
    expect(result).toContain('暂无执行记录');
  });

  it('should parse natural language and create schedule', async () => {
    const result = await cap.createFromNaturalLanguage('每天早上9点检查日志');

    expect(result).toContain('定时任务已创建');
    expect(result).toContain('日志检查');
  });
});
