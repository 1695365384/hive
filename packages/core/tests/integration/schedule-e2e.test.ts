/**
 * 定时任务端到端集成测试
 *
 * 验证定时任务的创建、管理和触发执行。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  createMockAI,
  simpleTextResponse,
  createMockProviderManagerModule,
} from './integration-helpers.js';
import { ScheduleRepository } from '../../src/storage/ScheduleRepository.js';
import { INITIAL_SCHEMA_UP } from '../../src/storage/migrations/001-initial.js';
import { SCHEDULES_UP as SCHEDULES_SCHEMA } from '../../src/storage/migrations/002-schedules.js';
import { SCHEDULES_V2_UP as SCHEDULES_V2_SCHEMA } from '../../src/storage/migrations/003-schedules-v2.js';

const { mockGenerateText, mockStreamText, getCallCount, resetCallCount } = createMockAI({
  responses: [simpleTextResponse('Mock response')],
});

vi.mock('ai', () => ({
  generateText: mockGenerateText,
  streamText: mockStreamText,
  stepCountIs: vi.fn((n: number) => n),
  tool: vi.fn((config: Record<string, unknown>) => config),
  zodSchema: vi.fn((schema: unknown) => schema),
}));

vi.mock('../../src/providers/ProviderManager.js', () => createMockProviderManagerModule());

describe('Schedule End-to-End', () => {
  let db: Database.Database;
  let repo: ScheduleRepository;

  beforeEach(() => {
    resetCallCount();
    vi.clearAllMocks();
    db = new Database(':memory:');
    db.exec(INITIAL_SCHEMA_UP);
    db.exec(SCHEDULES_SCHEMA);
    db.exec(SCHEDULES_V2_SCHEMA);
    repo = new ScheduleRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  // 8.2 创建定时任务
  describe('Schedule Creation', () => {
    it('should create a schedule via repository', async () => {
      const schedule = await repo.create({
        name: 'Daily Reminder',
        scheduleKind: 'cron',
        cron: '0 9 * * *',
        prompt: '提醒我喝水',
        action: 'chat',
      });

      expect(schedule).toBeDefined();
      expect(schedule.name).toBe('Daily Reminder');
      expect(schedule.cron).toBe('0 9 * * *');
    });

    it('should auto-generate ID for new schedule', async () => {
      const schedule = await repo.create({
        name: 'Test Schedule',
        scheduleKind: 'cron',
        cron: '*/30 * * * *',
        prompt: 'test prompt',
        action: 'chat',
      });

      expect(schedule.id).toBeDefined();
      expect(schedule.id.length).toBeGreaterThan(0);
    });
  });

  // 8.3 任务列表管理
  describe('Schedule List Management', () => {
    it('should list all schedules', async () => {
      await repo.create({ name: 'Task 1', scheduleKind: 'cron', cron: '0 9 * * *', prompt: 'p1', action: 'chat' });
      await repo.create({ name: 'Task 2', scheduleKind: 'cron', cron: '0 18 * * *', prompt: 'p2', action: 'chat' });

      const schedules = await repo.findAll();
      expect(schedules.length).toBe(2);
    });

    it('should delete a schedule', async () => {
      const schedule = await repo.create({
        name: 'To Delete',
        scheduleKind: 'cron',
        cron: '0 10 * * *',
        prompt: 'delete me',
        action: 'chat',
      });

      await repo.delete(schedule.id);

      const schedules = await repo.findAll();
      expect(schedules.length).toBe(0);
    });

    it('should update a schedule', async () => {
      const schedule = await repo.create({
        name: 'Original',
        scheduleKind: 'cron',
        cron: '0 9 * * *',
        prompt: 'original prompt',
        action: 'chat',
      });

      const updated = await repo.update(schedule.id, { name: 'Updated', prompt: 'new prompt' });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated');
    });
  });

  // 8.4 cron 表达式
  describe('Cron Validation', () => {
    it('should accept valid cron expressions', async () => {
      const schedule = await repo.create({
        name: 'Valid Cron',
        scheduleKind: 'cron',
        cron: '0 9 * * *',
        prompt: 'valid',
        action: 'chat',
      });
      expect(schedule.id).toBeDefined();
      expect(schedule.cron).toBe('0 9 * * *');
    });

    it('should accept every-mode schedules', async () => {
      const schedule = await repo.create({
        name: 'Every Mode',
        scheduleKind: 'every',
        intervalMs: 300000,
        prompt: 'every 5 min',
        action: 'chat',
      });
      expect(schedule.id).toBeDefined();
    });
  });

  // ScheduleCapability 集成
  describe('ScheduleCapability Integration', () => {
    it('should have schedule-related exports from index', async () => {
      const core = await import('../../src/index.js');
      expect(core.ScheduleEngine).toBeDefined();
      expect(core.createScheduleEngine).toBeDefined();
      expect(core.isValidCron).toBeDefined();
      expect(core.ScheduleRepository).toBeDefined();
    });
  });
});
