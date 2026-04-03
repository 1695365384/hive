/**
 * ScheduleTool 单元测试
 *
 * 测试 schedule 工具的 action 分派逻辑。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createScheduleTool } from '../../../src/tools/built-in/schedule-tools.js';
import type { ScheduleCapability } from '../../../src/agents/capabilities/ScheduleCapability.js';

// Mock ai module
vi.mock('ai', () => ({
  tool: (config: any) => ({
    description: config.description,
    inputSchema: config.inputSchema,
    execute: config.execute,
  }),
  zodSchema: (schema: any) => schema,
}));

function createMockScheduleCap(overrides?: Partial<ScheduleCapability>): ScheduleCapability {
  return {
    createFromNaturalLanguage: vi.fn().mockResolvedValue('Task created.'),
    list: vi.fn().mockResolvedValue('No tasks.'),
    remove: vi.fn().mockResolvedValue('Task removed.'),
    pause: vi.fn().mockResolvedValue('Task paused.'),
    resume: vi.fn().mockResolvedValue('Task resumed.'),
    history: vi.fn().mockResolvedValue('No history.'),
    ...overrides,
  } as unknown as ScheduleCapability;
}

describe('ScheduleTool', () => {
  let cap: ScheduleCapability;

  beforeEach(() => {
    vi.clearAllMocks();
    cap = createMockScheduleCap();
  });

  it('should create a valid tool with correct metadata', () => {
    const tool = createScheduleTool(cap);
    expect(tool.description).toContain('create');
    expect(tool.description).toContain('list');
    expect(tool.description).toContain('pause');
    expect(tool.description).toContain('resume');
    expect(tool.description).toContain('remove');
    expect(tool.description).toContain('history');
    expect(tool.inputSchema).toBeDefined();
    expect(tool.execute).toBeDefined();
  });

  describe('action=create', () => {
    it('should call createFromNaturalLanguage with correct message', async () => {
      const tool = createScheduleTool(cap);
      const result = await tool.execute!({
        action: 'create',
        name: 'Daily logs',
        prompt: 'Check logs and report',
        schedule: '0 9 * * *',
      });

      expect(cap.createFromNaturalLanguage).toHaveBeenCalledWith(
        expect.stringContaining('Daily logs'),
      );
      expect(cap.createFromNaturalLanguage).toHaveBeenCalledWith(
        expect.stringContaining('0 9 * * *'),
      );
      expect(result).toBe('Task created.');
    });

    it('should return error when required fields are missing', async () => {
      const tool = createScheduleTool(cap);
      const result = await tool.execute!({ action: 'create' });
      expect(result).toContain('Missing required fields');

      const result2 = await tool.execute!({ action: 'create', name: 'test' });
      expect(result2).toContain('Missing required fields');
    });
  });

  describe('action=list', () => {
    it('should call list and return result', async () => {
      const tool = createScheduleTool(cap);
      const result = await tool.execute!({ action: 'list' });
      expect(cap.list).toHaveBeenCalledOnce();
      expect(result).toBe('No tasks.');
    });
  });

  describe('action=remove', () => {
    it('should call remove with target', async () => {
      const tool = createScheduleTool(cap);
      const result = await tool.execute!({ action: 'remove', target: 'Daily logs' });
      expect(cap.remove).toHaveBeenCalledWith('Daily logs');
      expect(result).toBe('Task removed.');
    });

    it('should return error when target is missing', async () => {
      const tool = createScheduleTool(cap);
      const result = await tool.execute!({ action: 'remove' });
      expect(result).toContain('Missing required field');
    });
  });

  describe('action=pause', () => {
    it('should call pause with target', async () => {
      const tool = createScheduleTool(cap);
      const result = await tool.execute!({ action: 'pause', target: 'Daily logs' });
      expect(cap.pause).toHaveBeenCalledWith('Daily logs');
      expect(result).toBe('Task paused.');
    });
  });

  describe('action=resume', () => {
    it('should call resume with target', async () => {
      const tool = createScheduleTool(cap);
      const result = await tool.execute!({ action: 'resume', target: 'Daily logs' });
      expect(cap.resume).toHaveBeenCalledWith('Daily logs');
      expect(result).toBe('Task resumed.');
    });
  });

  describe('action=history', () => {
    it('should call history with target', async () => {
      const tool = createScheduleTool(cap);
      const result = await tool.execute!({ action: 'history', target: 'Daily logs' });
      expect(cap.history).toHaveBeenCalledWith('Daily logs');
      expect(result).toBe('No history.');
    });
  });

  describe('error handling', () => {
    it('should propagate ScheduleCapability errors', async () => {
      const errorCap = createMockScheduleCap({
        remove: vi.fn().mockResolvedValue('未找到任务: "nonexistent"'),
      });
      const tool = createScheduleTool(errorCap);
      const result = await tool.execute!({ action: 'remove', target: 'nonexistent' });
      expect(result).toContain('未找到任务');
    });
  });
});
