/**
 * AgentTool 单元测试
 *
 * 测试 Coordinator 通过 AgentTool 调用子代理的逻辑。
 * 子代理在当前进程内通过 AgentRunner.executeStreaming() 执行。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockAgentContext } from '../../mocks/agent-context.mock.js';
import { TaskManager } from '../../../src/agents/core/TaskManager.js';
import type { AgentResult } from '../../../src/agents/core/types.js';

// Mock ai module
vi.mock('ai', () => ({
  tool: (config: any) => ({
    description: config.description,
    inputSchema: config.inputSchema,
    execute: config.execute,
  }),
  zodSchema: (schema: any) => schema,
}));

// Mock AgentRunner
const mockExecuteStreaming = vi.fn();
vi.mock('../../../src/agents/core/runner.js', () => ({
  createAgentRunner: () => ({
    executeStreaming: mockExecuteStreaming,
  }),
}));

import { createAgentTool } from '../../../src/tools/built-in/agent-tool.js';

/** Helper: create a successful AgentResult */
function successResult(text = 'Done', tools: string[] = []): AgentResult {
  return { text, tools, success: true };
}

describe('AgentTool', () => {
  let context: ReturnType<typeof createMockAgentContext>;
  let taskManager: TaskManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteStreaming.mockReset();
    context = createMockAgentContext();
    taskManager = new TaskManager();
  });

  describe('createAgentTool()', () => {
    it('should create a valid AI SDK tool', async () => {
      mockExecuteStreaming.mockResolvedValue(successResult());

      const tool = createAgentTool(context, taskManager);
      await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      expect(tool.description).toContain('Worker');
      expect(tool.description).toContain('explore');
      expect(tool.description).toContain('plan');
      expect(tool.description).toContain('general');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should describe when to use and not use agents', async () => {
      mockExecuteStreaming.mockResolvedValue(successResult());

      const tool = createAgentTool(context, taskManager);
      await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      expect(tool.description).toContain('When to Use');
      expect(tool.description).toContain('parallel research');
      expect(tool.description).toContain('When NOT to Use');
      expect(tool.description).toContain('Simple text responses');
    });
  });

  describe('worker lifecycle', () => {
    it('should register and unregister worker', async () => {
      mockExecuteStreaming.mockResolvedValue(successResult());

      const tool = createAgentTool(context, taskManager);
      await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      expect(taskManager.getActiveTasks().length).toBe(0);
    });

    it('should call executeStreaming with correct arguments', async () => {
      mockExecuteStreaming.mockResolvedValue(successResult());

      const tool = createAgentTool(context, taskManager);
      await tool.execute!(
        { prompt: 'find all files', type: 'explore', model: 'gpt-4', maxTurns: 5 },
        {} as any,
      );

      expect(mockExecuteStreaming).toHaveBeenCalledWith(
        'explore',
        'find all files',
        expect.objectContaining({
          onText: expect.any(Function),
          onToolCall: expect.any(Function),
          onToolResult: expect.any(Function),
          onReasoning: expect.any(Function),
        }),
        expect.objectContaining({
          model: 'gpt-4',
          maxTurns: 5,
          abortSignal: expect.any(AbortSignal),
        }),
      );
    });

    it('should emit worker:start and worker:complete hooks on success', async () => {
      mockExecuteStreaming.mockResolvedValue(successResult());

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
    });

    it('should emit worker:tool-call and worker:tool-result hooks', async () => {
      let capturedCallbacks: any;
      mockExecuteStreaming.mockImplementation(async (_agentType, _prompt, callbacks) => {
        capturedCallbacks = callbacks;
        callbacks.onToolCall('glob', { pattern: '**/*.ts' });
        callbacks.onToolResult('glob', ['file1.ts', 'file2.ts']);
        return successResult('Done', ['glob']);
      });

      const tool = createAgentTool(context, taskManager);
      await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      const emitCalls = vi.mocked(context.hookRegistry.emit).mock.calls;
      const toolCallCalls = emitCalls.filter(c => c[0] === 'worker:tool-call');
      const toolResultCalls = emitCalls.filter(c => c[0] === 'worker:tool-result');

      expect(toolCallCalls.length).toBe(1);
      expect(toolCallCalls[0][1]).toMatchObject({ toolName: 'glob', workerType: 'explore' });

      expect(toolResultCalls.length).toBe(1);
      expect(toolResultCalls[0][1]).toMatchObject({ toolName: 'glob', workerType: 'explore' });
    });

    it('should emit worker:reasoning hook', async () => {
      mockExecuteStreaming.mockImplementation(async (_agentType, _prompt, callbacks) => {
        callbacks.onReasoning('Let me think about this...');
        return successResult();
      });

      const tool = createAgentTool(context, taskManager);
      await tool.execute!(
        { prompt: 'test', type: 'plan' },
        {} as any,
      );

      const emitCalls = vi.mocked(context.hookRegistry.emit).mock.calls;
      const reasoningCalls = emitCalls.filter(c => c[0] === 'worker:reasoning');
      expect(reasoningCalls.length).toBe(1);
      expect(reasoningCalls[0][1]).toMatchObject({ text: 'Let me think about this...', workerType: 'plan' });
    });
  });

  describe('result handling', () => {
    it('should return structured summary with status on success', async () => {
      mockExecuteStreaming.mockResolvedValue(successResult('Found 3 files', ['glob', 'grep']));

      const tool = createAgentTool(context, taskManager);
      const result = await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      expect(result).toContain('[Worker explore completed in ');
      expect(result).toContain('Status: SUCCESS');
      expect(result).toContain('Tools used: glob, grep');
    });

    it('should return FAILED status on error', async () => {
      mockExecuteStreaming.mockResolvedValue({
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

      expect(result).toContain('Status: FAILED');
      expect(result).toContain('No available model');
    });

    it('should include output excerpt when worker sends text', async () => {
      mockExecuteStreaming.mockImplementation(async (_agentType, _prompt, callbacks) => {
        callbacks.onText('Found 5 files matching the pattern.');
        return successResult('Found 5 files', []);
      });

      const tool = createAgentTool(context, taskManager);
      const result = await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      expect(result).toContain('Output (');
      expect(result).toContain('Found 5 files matching the pattern.');
    });

    it('should unregister worker even on error', async () => {
      mockExecuteStreaming.mockRejectedValue(new Error('LLM connection failed'));

      const tool = createAgentTool(context, taskManager);
      await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      expect(taskManager.getActiveTasks().length).toBe(0);
      expect(taskManager.activeCount).toBe(0);
    });
  });

  describe('abort', () => {
    it('should abort worker via TaskManager', async () => {
      let capturedSignal: AbortSignal | undefined;
      mockExecuteStreaming.mockImplementation(async (_agentType, _prompt, _callbacks, options) => {
        capturedSignal = options?.abortSignal;
        // Simulate a long-running task that checks abort
        return new Promise((resolve) => {
          const check = () => {
            if (capturedSignal?.aborted) {
              resolve({ text: '', tools: [], success: false, error: 'Worker aborted' } satisfies AgentResult);
            } else {
              setTimeout(check, 10);
            }
          };
          check();
        });
      });

      const tool = createAgentTool(context, taskManager);

      const executePromise = tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      // Wait for worker to register
      await new Promise(resolve => setTimeout(resolve, 5));

      // Abort via TaskManager
      const activeTasks = taskManager.getActiveTasks();
      expect(activeTasks.length).toBe(1);
      taskManager.abort(activeTasks[0].id);

      const result = await executePromise;
      expect(result).toContain('Worker aborted');
      expect(taskManager.activeCount).toBe(0);
    });

    it('should abort all workers on abortAll()', async () => {
      mockExecuteStreaming.mockImplementation(async (_agentType, _prompt, _callbacks, options) => {
        return new Promise((resolve) => {
          const check = () => {
            if (options?.abortSignal?.aborted) {
              resolve({ text: '', tools: [], success: false, error: 'Worker aborted' } satisfies AgentResult);
            } else {
              setTimeout(check, 10);
            }
          };
          check();
        });
      });

      const tool = createAgentTool(context, taskManager);

      const p1 = tool.execute!({ prompt: 'task1', type: 'explore' }, {} as any);
      const p2 = tool.execute!({ prompt: 'task2', type: 'explore' }, {} as any);

      await new Promise(resolve => setTimeout(resolve, 5));
      expect(taskManager.activeCount).toBe(2);

      taskManager.abortAll();

      const results = await Promise.allSettled([p1, p2]);
      expect(taskManager.activeCount).toBe(0);

      for (const r of results) {
        expect(r.status).toBe('fulfilled');
        if (r.status === 'fulfilled') {
          expect(r.value).toContain('Worker aborted');
        }
      }
    });

    it('should record peak concurrent workers', async () => {
      mockExecuteStreaming.mockImplementation(async (_agentType, _prompt, _callbacks, options) => {
        return new Promise((resolve) => {
          const check = () => {
            if (options?.abortSignal?.aborted) {
              resolve({ text: '', tools: [], success: false, error: 'Worker aborted' } satisfies AgentResult);
            } else {
              setTimeout(check, 10);
            }
          };
          check();
        });
      });

      const tool = createAgentTool(context, taskManager);

      const p1 = tool.execute!({ prompt: 'a', type: 'explore' }, {} as any);
      const p2 = tool.execute!({ prompt: 'b', type: 'explore' }, {} as any);
      const p3 = tool.execute!({ prompt: 'c', type: 'explore' }, {} as any);

      await new Promise(resolve => setTimeout(resolve, 5));
      expect(taskManager.peakConcurrent).toBe(3);

      taskManager.abortAll();
      await Promise.allSettled([p1, p2, p3]);
    });
  });
});
