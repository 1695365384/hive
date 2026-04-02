/**
 * AgentTool 单元测试
 *
 * 测试 Coordinator 通过 AgentTool 派生 Worker 的逻辑。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockAgentContext } from '../../mocks/agent-context.mock.js';
import { TaskManager } from '../../../src/agents/core/TaskManager.js';

// Mock ai module (to isolate unit under test)
const mockTool = vi.fn();
vi.mock('ai', () => ({
  tool: (config: any) => {
    mockTool(config);
    return {
      description: config.description,
      inputSchema: config.inputSchema,
      execute: config.execute,
    };
  },
  zodSchema: (schema: any) => schema,
}));

import { createAgentTool } from '../../../src/tools/built-in/agent-tool.js';

describe('AgentTool', () => {
  let context: ReturnType<typeof createMockAgentContext>;
  let taskManager: TaskManager;

  beforeEach(() => {
    vi.clearAllMocks();
    context = createMockAgentContext();
    taskManager = new TaskManager();
  });

  describe('createAgentTool()', () => {
    it('should create a valid AI SDK tool', () => {
      const tool = createAgentTool(context, taskManager);

      expect(tool.description).toContain('Worker');
      expect(tool.description).toContain('explore');
      expect(tool.description).toContain('plan');
      expect(tool.description).toContain('general');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should describe when to use and not use agents', () => {
      const tool = createAgentTool(context, taskManager);

      expect(tool.description).toContain('When to Use');
      expect(tool.description).toContain('parallel research');
      expect(tool.description).toContain('When NOT to Use');
      expect(tool.description).toContain('Simple text responses');
    });
  });

  describe('routing', () => {
    it('should route type="explore" to runner.executeStreaming()', async () => {
      const tool = createAgentTool(context, taskManager);

      await tool.execute!(
        { prompt: 'Find all API endpoints', type: 'explore' },
        {} as any,
      );

      expect(context.runner.executeStreaming).toHaveBeenCalledWith(
        'explore',
        'Find all API endpoints',
        expect.any(Object), // callbacks
        expect.objectContaining({ timeout: 300_000 }),
      );
    });

    it('should route type="plan" to runner.executeStreaming()', async () => {
      const tool = createAgentTool(context, taskManager);

      await tool.execute!(
        { prompt: 'Analyze dependencies', type: 'plan' },
        {} as any,
      );

      expect(context.runner.executeStreaming).toHaveBeenCalledWith(
        'plan',
        'Analyze dependencies',
        expect.any(Object),
        expect.objectContaining({ timeout: 300_000 }),
      );
    });

    it('should route type="general" to runner.executeStreaming()', async () => {
      const tool = createAgentTool(context, taskManager);

      await tool.execute!(
        { prompt: 'Fix the bug', type: 'general' },
        {} as any,
      );

      expect(context.runner.executeStreaming).toHaveBeenCalledWith(
        'general',
        'Fix the bug',
        expect.any(Object),
        expect.objectContaining({ timeout: 300_000 }),
      );
    });
  });

  describe('options passthrough', () => {
    it('should pass model override', async () => {
      const tool = createAgentTool(context, taskManager);

      await tool.execute!(
        { prompt: 'test', type: 'explore', model: 'gpt-4o-mini' },
        {} as any,
      );

      const opts = context.runner.executeStreaming.mock.calls[0][3];
      expect(opts.model).toBe('gpt-4o-mini');
    });

    it('should pass maxTurns override', async () => {
      const tool = createAgentTool(context, taskManager);

      await tool.execute!(
        { prompt: 'test', type: 'plan', maxTurns: 5 },
        {} as any,
      );

      const opts = context.runner.executeStreaming.mock.calls[0][3];
      expect(opts.maxTurns).toBe(5);
    });
  });

  describe('worker lifecycle', () => {
    it('should register and unregister worker', async () => {
      const tool = createAgentTool(context, taskManager);

      await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      expect(taskManager.getActiveTasks().length).toBe(0);
    });

    it('should unregister worker on error', async () => {
      (context.runner.executeStreaming as any).mockRejectedValueOnce(new Error('Worker failed'));

      const tool = createAgentTool(context, taskManager);

      await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      expect(taskManager.getActiveTasks().length).toBe(0);
    });

    it('should emit worker:start and worker:complete hooks on success', async () => {
      const tool = createAgentTool(context, taskManager);

      await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      const emitCalls = vi.mocked(context.hookRegistry.emit).mock.calls;
      const workerStartCalls = emitCalls.filter(c => c[0] === 'worker:start');
      const workerCompleteCalls = emitCalls.filter(c => c[0] === 'worker:complete');
      expect(workerStartCalls.length).toBe(1);
      expect(workerCompleteCalls.length).toBe(1);

      const startCtx = workerStartCalls[0][1] as any;
      expect(startCtx.workerType).toBe('explore');

      const completeCtx = workerCompleteCalls[0][1] as any;
      expect(completeCtx.success).toBe(true);
      expect(completeCtx.workerType).toBe('explore');
    });

    it('should emit worker:complete with success=false on error', async () => {
      (context.runner.executeStreaming as any).mockRejectedValueOnce(new Error('Worker failed'));

      const tool = createAgentTool(context, taskManager);

      const result = await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      const emitCalls = vi.mocked(context.hookRegistry.emit).mock.calls;
      const completeCalls = emitCalls.filter(c => c[0] === 'worker:complete');
      expect(completeCalls.length).toBe(1);
      expect((completeCalls[0][1] as any).success).toBe(false);
      expect(result).toContain('Worker error');
    });
  });

  describe('result handling', () => {
    it('should return status with line count from onText callback on success', async () => {
      (context.runner.executeStreaming as any).mockImplementationOnce(async (_name, _prompt, callbacks) => {
        callbacks.onText?.('Hello ');
        callbacks.onText?.('World');
        return { text: 'Hello World', success: true, tools: [] };
      });

      const tool = createAgentTool(context, taskManager);

      const result = await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      expect(result).toMatch(/^\[Worker explore completed in \d+\.\d+s — 1 lines output\]$/);
    });

    it('should return status with 0 lines when worker returns empty text', async () => {
      (context.runner.executeStreaming as any).mockResolvedValueOnce({
        text: '',
        success: true,
        tools: [],
      });

      const tool = createAgentTool(context, taskManager);

      const result = await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      expect(result).toMatch(/^\[Worker explore completed in \d+\.\d+s — 0 lines output\]$/);
    });

    it('should return error message when worker fails', async () => {
      (context.runner.executeStreaming as any).mockResolvedValueOnce({
        text: '',
        tools: [],
        success: false,
        error: 'No available model',
      });

      const tool = createAgentTool(context, taskManager);

      const result = await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      expect(result).toContain('Worker error');
      expect(result).toContain('No available model');
    });
  });
});
