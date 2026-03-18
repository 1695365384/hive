/**
 * Task 系统测试
 *
 * 测试 Task 类和并行执行功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Task, createTask, runTask, runParallel, mapParallel } from '../../src/agents/core/task.js';
import { query } from '@anthropic-ai/claude-agent-sdk';

// Mock Agent SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

describe('Task System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Task', () => {
    it('should create a task with config', () => {
      const task = new Task({
        name: 'test-task',
        prompt: 'Test prompt',
      });
      expect(task.name).toBe('test-task');
    });

    it('should run task and return result', async () => {
      // Mock query to return a result
      const mockGenerator = async function* () {
        yield { result: 'Task completed' };
      };
      vi.mocked(query).mockReturnValue(mockGenerator());

      const task = new Task({
        name: 'test-task',
        prompt: 'Test prompt',
      });

      const result = await task.run();

      expect(result.success).toBe(true);
      expect(result.text).toBe('Task completed');
      expect(result.name).toBe('test-task');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should capture tool usage', async () => {
      const mockGenerator = async function* () {
        yield { content: [{ name: 'Read', input: { file_path: '/test.ts' } }] };
        yield { result: 'Done' };
      };
      vi.mocked(query).mockReturnValue(mockGenerator());

      const task = new Task({
        name: 'test-task',
        prompt: 'Test prompt',
      });

      const result = await task.run();

      expect(result.tools).toContain('Read');
    });

    it('should capture usage stats', async () => {
      const mockGenerator = async function* () {
        yield {
          result: 'Done',
          usage: { input_tokens: 100, output_tokens: 50 }
        };
      };
      vi.mocked(query).mockReturnValue(mockGenerator());

      const task = new Task({
        name: 'test-task',
        prompt: 'Test prompt',
      });

      const result = await task.run();

      expect(result.usage).toEqual({ input: 100, output: 50 });
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(query).mockImplementation(() => {
        throw new Error('Query failed');
      });

      const task = new Task({
        name: 'test-task',
        prompt: 'Test prompt',
      });

      const result = await task.run();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Query failed');
    });

    it('should use agentType configuration', async () => {
      const mockGenerator = async function* () {
        yield { result: 'Explored' };
      };
      vi.mocked(query).mockReturnValue(mockGenerator());

      const task = new Task({
        name: 'explore-task',
        prompt: 'Find files',
        agentType: 'explore',
      });

      const result = await task.run();

      expect(result.success).toBe(true);
      // Verify query was called with explore agent's system prompt
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Find files',
          options: expect.objectContaining({
            systemPrompt: expect.stringContaining('exploration agent'),
          }),
        })
      );
    });

    it('should use custom tools when specified', async () => {
      const mockGenerator = async function* () {
        yield { result: 'Done' };
      };
      vi.mocked(query).mockReturnValue(mockGenerator());

      const task = new Task({
        name: 'test-task',
        prompt: 'Test',
        tools: ['Read', 'Grep'],
      });

      await task.run();

      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            allowedTools: ['Read', 'Grep'],
          }),
        })
      );
    });

    it('should use custom model when specified', async () => {
      const mockGenerator = async function* () {
        yield { result: 'Done' };
      };
      vi.mocked(query).mockReturnValue(mockGenerator());

      const task = new Task({
        name: 'test-task',
        prompt: 'Test',
        model: 'claude-opus-4-6',
      });

      await task.run();

      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            model: 'claude-opus-4-6',
          }),
        })
      );
    });
  });

  describe('createTask', () => {
    it('should create a task instance', () => {
      const task = createTask({
        name: 'created-task',
        prompt: 'Test',
      });
      expect(task).toBeInstanceOf(Task);
      expect(task.name).toBe('created-task');
    });
  });

  describe('runTask', () => {
    it('should run task with minimal config', async () => {
      const mockGenerator = async function* () {
        yield { result: 'Quick result' };
      };
      vi.mocked(query).mockReturnValue(mockGenerator());

      const result = await runTask('Quick task');

      expect(result.text).toBe('Quick result');
      expect(result.success).toBe(true);
    });

    it('should accept partial options', async () => {
      const mockGenerator = async function* () {
        yield { result: 'Done' };
      };
      vi.mocked(query).mockReturnValue(mockGenerator());

      const result = await runTask('Task with options', {
        name: 'custom-name',
        model: 'claude-haiku-4-5',
      });

      expect(result.name).toBe('custom-name');
    });
  });

  describe('runParallel', () => {
    it('should run tasks in parallel', async () => {
      const mockGenerator = async function* () {
        yield { result: 'Result' };
      };
      vi.mocked(query).mockReturnValue(mockGenerator());

      const results = await runParallel([
        { prompt: 'Task 1' },
        { prompt: 'Task 2' },
        { prompt: 'Task 3' },
      ]);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    it('should respect maxConcurrent limit', async () => {
      let concurrentCount = 0;
      let maxConcurrent = 0;

      vi.mocked(query).mockImplementation(() => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);

        return (async function* () {
          await new Promise(resolve => setTimeout(resolve, 10));
          concurrentCount--;
          yield { result: 'Done' };
        })();
      });

      await runParallel(
        Array(10).fill(null).map((_, i) => ({ prompt: `Task ${i}` })),
        3 // maxConcurrent
      );

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should handle mixed success and failure', async () => {
      let callCount = 0;

      vi.mocked(query).mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Task 2 failed');
        }
        return (async function* () {
          yield { result: 'Success' };
        })();
      });

      const results = await runParallel([
        { prompt: 'Task 1' },
        { prompt: 'Task 2' },
        { prompt: 'Task 3' },
      ]);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });

    it('should auto-generate names if not provided', async () => {
      const mockGenerator = async function* () {
        yield { result: 'Done' };
      };
      vi.mocked(query).mockReturnValue(mockGenerator());

      const results = await runParallel([
        { prompt: 'Task 1' },
        { prompt: 'Task 2' },
      ]);

      expect(results[0].name).toMatch(/^task-\d+$/);
      expect(results[1].name).toMatch(/^task-\d+$/);
    });
  });

  describe('mapParallel', () => {
    it('should map items in parallel', async () => {
      const items = [1, 2, 3, 4, 5];
      const mapper = vi.fn(async (item: number) => item * 2);

      const results = await mapParallel(items, mapper, 2);

      expect(results).toEqual([2, 4, 6, 8, 10]);
      expect(mapper).toHaveBeenCalledTimes(5);
    });

    it('should respect concurrency limit', async () => {
      let concurrentCount = 0;
      let maxConcurrent = 0;

      const mapper = async (item: number) => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise(resolve => setTimeout(resolve, 10));
        concurrentCount--;
        return item * 2;
      };

      await mapParallel([1, 2, 3, 4, 5, 6, 7, 8], mapper, 3);

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should preserve order', async () => {
      const items = [5, 3, 1, 4, 2];
      const mapper = async (item: number) => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
        return item;
      };

      const results = await mapParallel(items, mapper, 2);

      expect(results).toEqual([5, 3, 1, 4, 2]);
    });

    it('should handle errors in mapper', async () => {
      const mapper = async (item: number) => {
        if (item === 3) throw new Error('Failed on 3');
        return item * 2;
      };

      await expect(mapParallel([1, 2, 3, 4], mapper, 2)).rejects.toThrow('Failed on 3');
    });
  });

  describe('Task performance', () => {
    it('should track duration', async () => {
      const mockGenerator = async function* () {
        await new Promise(resolve => setTimeout(resolve, 50));
        yield { result: 'Done' };
      };
      vi.mocked(query).mockReturnValue(mockGenerator());

      const task = new Task({
        name: 'timed-task',
        prompt: 'Test',
      });

      const result = await task.run();

      expect(result.duration).toBeGreaterThanOrEqual(50);
    });
  });
});
