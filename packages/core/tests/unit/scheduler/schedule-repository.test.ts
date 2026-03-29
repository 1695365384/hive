/**
 * ScheduleRepository 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../../src/storage/Database.js';
import { MigrationRunner } from '../../../src/storage/MigrationRunner.js';
import { ScheduleRepository, createScheduleRepository } from '../../../src/storage/ScheduleRepository.js';
import type { IScheduleRepository, Schedule } from '../../../src/scheduler/types.js';
// Import migrations to trigger registration
import '../../../src/storage/migrations/index.js';

describe('ScheduleRepository', () => {
  let db: Database.Database;
  let repo: IScheduleRepository;

  beforeEach(async () => {
    db = new Database(':memory:');
    const runner = new MigrationRunner(db);
    await runner.runPending();
    repo = createScheduleRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a schedule', async () => {
    const schedule = await repo.create({
      name: 'Test Task',
      cron: '0 9 * * *',
      prompt: 'Check logs',
      action: 'chat',
    });

    expect(schedule.id).toBeDefined();
    expect(schedule.name).toBe('Test Task');
    expect(schedule.cron).toBe('0 9 * * *');
    expect(schedule.enabled).toBe(true);
    expect(schedule.runCount).toBe(0);
  });

  it('should find all schedules', async () => {
    await repo.create({ name: 'Task 1', cron: '0 9 * * *', prompt: 'A' });
    await repo.create({ name: 'Task 2', cron: '0 10 * * *', prompt: 'B' });

    const all = await repo.findAll();
    expect(all).toHaveLength(2);
  });

  it('should find schedule by id', async () => {
    const created = await repo.create({ name: 'Task 1', cron: '0 9 * * *', prompt: 'A' });
    const found = await repo.findById(created.id);

    expect(found).not.toBeNull();
    expect(found!.name).toBe('Task 1');
  });

  it('should return null for non-existent id', async () => {
    const found = await repo.findById('non-existent');
    expect(found).toBeNull();
  });

  it('should find only enabled schedules', async () => {
    await repo.create({ name: 'Task 1', cron: '0 9 * * *', prompt: 'A' });
    const task2 = await repo.create({ name: 'Task 2', cron: '0 10 * * *', prompt: 'B' });
    await repo.update(task2.id, { enabled: false });

    const enabled = await repo.findEnabled();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].name).toBe('Task 1');
  });

  it('should update a schedule', async () => {
    const created = await repo.create({ name: 'Task 1', cron: '0 9 * * *', prompt: 'A' });
    const updated = await repo.update(created.id, { name: 'Updated Task', enabled: false });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Updated Task');
    expect(updated!.enabled).toBe(false);
  });

  it('should return null when updating non-existent schedule', async () => {
    const result = await repo.update('non-existent', { name: 'X' });
    expect(result).toBeNull();
  });

  it('should delete a schedule', async () => {
    const created = await repo.create({ name: 'Task 1', cron: '0 9 * * *', prompt: 'A' });
    const deleted = await repo.delete(created.id);

    expect(deleted).toBe(true);
    const found = await repo.findById(created.id);
    expect(found).toBeNull();
  });

  it('should return false when deleting non-existent schedule', async () => {
    const deleted = await repo.delete('non-existent');
    expect(deleted).toBe(false);
  });

  it('should create and retrieve run records', async () => {
    const schedule = await repo.create({ name: 'Task 1', cron: '0 9 * * *', prompt: 'A' });
    const run = await repo.createRun({
      scheduleId: schedule.id,
      status: 'success',
      startedAt: new Date(),
      completedAt: new Date(),
    });

    expect(run.id).toBeDefined();
    expect(run.scheduleId).toBe(schedule.id);

    const runs = await repo.findRunsByScheduleId(schedule.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('success');
  });

  it('should update run records', async () => {
    const schedule = await repo.create({ name: 'Task 1', cron: '0 9 * * *', prompt: 'A' });
    const run = await repo.createRun({
      scheduleId: schedule.id,
      status: 'running',
      startedAt: new Date(),
    });

    await repo.updateRun(run.id, {
      status: 'failed',
      completedAt: new Date(),
      error: 'Timeout',
    });

    const runs = await repo.findRunsByScheduleId(schedule.id);
    expect(runs[0].status).toBe('failed');
    expect(runs[0].error).toBe('Timeout');
  });

  it('should increment run_count when creating runs', async () => {
    const schedule = await repo.create({ name: 'Task 1', cron: '0 9 * * *', prompt: 'A' });
    expect(schedule.runCount).toBe(0);

    await repo.createRun({ scheduleId: schedule.id, status: 'success', startedAt: new Date(), completedAt: new Date() });
    await repo.createRun({ scheduleId: schedule.id, status: 'success', startedAt: new Date(), completedAt: new Date() });

    const updated = await repo.findById(schedule.id);
    expect(updated!.runCount).toBe(2);
  });
});
