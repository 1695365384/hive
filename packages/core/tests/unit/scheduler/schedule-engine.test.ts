/**
 * ScheduleEngine 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../../src/storage/Database.js';
import { MigrationRunner } from '../../../src/storage/MigrationRunner.js';
import { ScheduleRepository } from '../../../src/storage/ScheduleRepository.js';
import { ScheduleEngine, createScheduleEngine } from '../../../src/scheduler/ScheduleEngine.js';
import type { IScheduleEngine, TriggerCallback, Schedule } from '../../../src/scheduler/types.js';
// Import migrations to trigger registration
import '../../../src/storage/migrations/index.js';

describe('ScheduleEngine', () => {
  let db: Database.Database;
  let repo: ScheduleRepository;
  let engine: IScheduleEngine;
  let onTrigger: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    db = new Database(':memory:');
    const runner = new MigrationRunner(db);
    await runner.runPending();
    repo = new ScheduleRepository(db);
    onTrigger = vi.fn().mockResolvedValue({ sessionId: 'sess-1', success: true });
    engine = createScheduleEngine(repo, onTrigger);
  });

  afterEach(async () => {
    await engine.stop();
    db.close();
  });

  it('should start and load enabled tasks', async () => {
    await repo.create({ name: 'Task 1', cron: '0 9 * * *', prompt: 'A' });
    await repo.create({ name: 'Task 2', cron: '0 10 * * *', prompt: 'B' });
    // Create a paused task - should not be loaded
    const task3 = await repo.create({ name: 'Task 3', cron: '0 11 * * *', prompt: 'C' });
    await repo.update(task3.id, { enabled: false });

    const count = await engine.start();
    expect(count).toBe(2);
  });

  it('should start with 0 tasks when no enabled tasks', async () => {
    const count = await engine.start();
    expect(count).toBe(0);
  });

  it('should add task at runtime', async () => {
    await engine.start();
    const schedule = await repo.create({ name: 'New Task', cron: '0 9 * * *', prompt: 'A' });

    engine.addTask(schedule);
    const status = engine.getStatus();
    expect(status.registeredCount).toBe(1);
  });

  it('should pause and resume task', async () => {
    await engine.start();
    const schedule = await repo.create({ name: 'Task', cron: '0 9 * * *', prompt: 'A' });
    engine.addTask(schedule);

    const paused = engine.pauseTask(schedule.id);
    expect(paused).toBe(true);
    expect(engine.getStatus().registeredCount).toBe(0);

    const resumed = await engine.resumeTask(schedule.id);
    expect(resumed).toBe(true);
    expect(engine.getStatus().registeredCount).toBe(1);
  });

  it('should remove task', async () => {
    await engine.start();
    const schedule = await repo.create({ name: 'Task', cron: '0 9 * * *', prompt: 'A' });
    engine.addTask(schedule);

    const removed = engine.removeTask(schedule.id);
    expect(removed).toBe(true);
    expect(engine.getStatus().registeredCount).toBe(0);
  });

  it('should return status', async () => {
    await engine.start();
    const status = engine.getStatus();
    expect(status.running).toBe(true);
    expect(status.registeredCount).toBe(0);
    expect(status.runningCount).toBe(0);
  });

  it('should stop gracefully', async () => {
    await engine.start();
    const schedule = await repo.create({ name: 'Task', cron: '0 9 * * *', prompt: 'A' });
    engine.addTask(schedule);

    await engine.stop();
    const status = engine.getStatus();
    expect(status.running).toBe(false);
    expect(status.registeredCount).toBe(0);
  });

  it('should skip duplicate task registration', async () => {
    await engine.start();
    const schedule = await repo.create({ name: 'Task', cron: '0 9 * * *', prompt: 'A' });

    engine.addTask(schedule);
    engine.addTask(schedule); // duplicate
    expect(engine.getStatus().registeredCount).toBe(1);
  });

  it('should not crash on pause non-existent task', () => {
    const result = engine.pauseTask('non-existent');
    expect(result).toBe(false);
  });
});
