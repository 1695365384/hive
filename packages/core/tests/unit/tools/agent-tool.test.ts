/**
 * AgentTool 单元测试
 *
 * 测试 Coordinator 通过 AgentTool 派生 Worker 的逻辑。
 * Worker 运行在 worker_threads 中，通过消息协议通信。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockAgentContext } from '../../mocks/agent-context.mock.js';
import { TaskManager } from '../../../src/agents/core/TaskManager.js';
import type { AgentResult } from '../../../src/agents/core/types.js';
import type { WorkerEventMessage, WorkerInboundMessage } from '../../../src/workers/worker-entry.js';

// Mock ai module
vi.mock('ai', () => ({
  tool: (config: any) => ({
    description: config.description,
    inputSchema: config.inputSchema,
    execute: config.execute,
  }),
  zodSchema: (schema: any) => schema,
}));

// Mock worker_threads
// Default behavior: auto-complete when receiving 'execute' message
const mockWorkerInstances: Array<{
  onMessageHandlers: Map<string, Function>;
  terminate: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
  _simulateMessage: (msg: WorkerEventMessage) => void;
  _disableAutoRespond: () => void;
  _terminated: boolean;
}> = [];

vi.mock('node:worker_threads', () => {
  class MockWorker {
    onMessageHandlers = new Map<string, Function>();
    private _onMessageHandler?: Function;
    private _autoRespond = true;

    // Use plain function, not vi.fn(), so clearAllMocks doesn't reset it
    _terminated = false;

    terminate() {
      this._terminated = true;
    }

    postMessage(msg: any) {
      if (this._autoRespond && this._onMessageHandler) {
        // Use setImmediate to simulate async worker behavior
        setImmediate(() => {
          // Simulate a 'complete' response (not echo back the 'execute' message)
          this._onMessageHandler({
            type: 'complete',
            result: { text: 'Done', tools: [], success: true } satisfies import('../../../src/agents/core/types.js').AgentResult,
            duration: 10,
          });
        });
      }
    }

    on(event: string, handler: Function) {
      this.onMessageHandlers.set(event, handler);
      if (event === 'message') {
        this._onMessageHandler = handler;
      }
    }

    _simulateMessage(msg: WorkerEventMessage) {
      const handler = this.onMessageHandlers.get('message');
      if (handler) handler(msg);
    }

    // Allow tests to disable auto-respond
    _disableAutoRespond() {
      this._autoRespond = false;
    }

    constructor() {
      // Wrap with vi.spyOn so we can assert calls while preserving functionality
      vi.spyOn(this, 'terminate');
      vi.spyOn(this, 'postMessage');
      mockWorkerInstances.push(this);
    }
  }
  return { Worker: MockWorker };
});

import { createAgentTool } from '../../../src/tools/built-in/agent-tool.js';

describe('AgentTool', () => {
  let context: ReturnType<typeof createMockAgentContext>;
  let taskManager: TaskManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkerInstances.length = 0;
    context = createMockAgentContext();
    taskManager = new TaskManager();
  });

  afterEach(() => {
    mockWorkerInstances.length = 0;
  });

  describe('createAgentTool()', () => {
    it('should create a valid AI SDK tool', async () => {
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
      const tool = createAgentTool(context, taskManager);
      await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      expect(taskManager.getActiveTasks().length).toBe(0);
    });

    it('should create Worker thread and send execute message', async () => {
      const tool = createAgentTool(context, taskManager);
      await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      const worker = mockWorkerInstances[0]!;
      expect(worker.postMessage).toHaveBeenCalledWith({
        type: 'execute',
        payload: expect.objectContaining({
          agentType: 'explore',
          prompt: 'test',
        }),
      });
    });

    it('should call worker.terminate() after completion', async () => {
      const tool = createAgentTool(context, taskManager);
      await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      expect(mockWorkerInstances[0]!.terminate).toHaveBeenCalledTimes(1);
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
    });
  });

  describe('result handling', () => {
    it('should return structured summary with status on success', async () => {
      const tool = createAgentTool(context, taskManager);
      const result = await tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      expect(result).toContain('[Worker explore completed in ');
      expect(result).toContain('Status: SUCCESS');
    });

    it('should return FAILED status on error', async () => {
      // Override default mock postMessage to simulate error
      mockWorkerInstances.length = 0;
      const tool = createAgentTool(context, taskManager);

      // Execute and immediately configure mock to send error
      const executePromise = tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      // Now the Worker has been created, override postMessage
      const worker = mockWorkerInstances[0]!;
      worker.postMessage = vi.fn(() => {
        setImmediate(() => {
          worker._simulateMessage({ type: 'error', error: 'Worker failed', duration: 5 });
        });
      });

      const result = await executePromise;
      expect(result).toContain('Status: FAILED');
      expect(result).toContain('Worker failed');
    });

    it('should include tools used in result', async () => {
      mockWorkerInstances.length = 0;
      const tool = createAgentTool(context, taskManager);

      const executePromise = tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      const worker = mockWorkerInstances[0]!;
      worker.postMessage = vi.fn(() => {
        setImmediate(() => {
          worker._simulateMessage({
            type: 'complete',
            result: { text: 'Done', tools: ['glob', 'grep'], success: true } satisfies AgentResult,
            duration: 10,
          });
        });
      });

      const result = await executePromise;
      expect(result).toContain('Tools used: glob, grep');
    });

    it('should include output excerpt when worker sends text', async () => {
      mockWorkerInstances.length = 0;
      const tool = createAgentTool(context, taskManager);

      const executePromise = tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      const worker = mockWorkerInstances[0]!;
      worker.postMessage = vi.fn(() => {
        setImmediate(() => {
          worker._simulateMessage({ type: 'text', text: 'Found 5 files matching the pattern.' });
          worker._simulateMessage({
            type: 'complete',
            result: { text: 'Found 5 files', tools: [], success: true } satisfies AgentResult,
            duration: 10,
          });
        });
      });

      const result = await executePromise;
      expect(result).toContain('Output excerpt:');
      expect(result).toContain('Found 5 files matching the pattern.');
    });
  });

  describe('abort', () => {
    it('should terminate worker when aborted', async () => {
      const tool = createAgentTool(context, taskManager);

      // Disable auto-respond so worker never completes
      const executePromise = tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      // Worker was created, disable auto-respond
      const worker = mockWorkerInstances[0]!;
      worker._disableAutoRespond();

      // Abort immediately
      const activeTasks = taskManager.getActiveTasks();
      expect(activeTasks.length).toBe(1);
      taskManager.abort(activeTasks[0].id);

      const result = await executePromise;
      expect(result).toContain('Worker aborted');
      expect(worker._terminated).toBe(true);
    });

    it('should send abort message to worker before terminate', async () => {
      const tool = createAgentTool(context, taskManager);

      const executePromise = tool.execute!(
        { prompt: 'test', type: 'explore' },
        {} as any,
      );

      const worker = mockWorkerInstances[0]!;
      worker._disableAutoRespond();

      // Abort via TaskManager
      taskManager.abort(taskManager.getActiveTasks()[0].id);

      await executePromise;

      // Verify abort message was sent to worker
      const postMessageCalls = vi.mocked(worker.postMessage).mock.calls;
      const abortMessages = postMessageCalls.filter(
        c => (c[0] as WorkerInboundMessage).type === 'abort',
      );
      expect(abortMessages.length).toBeGreaterThanOrEqual(1);
      expect(abortMessages[0][0]).toEqual({ type: 'abort' });
      // terminate should still be called as fallback
      expect(worker._terminated).toBe(true);
    });

    it('should terminate all workers on abortAll()', async () => {
      const tool = createAgentTool(context, taskManager);

      const p1 = tool.execute!({ prompt: 'task1', type: 'explore' }, {} as any);
      const p2 = tool.execute!({ prompt: 'task2', type: 'explore' }, {} as any);

      // Disable auto-respond on both workers
      for (const w of mockWorkerInstances) {
        w._disableAutoRespond();
      }

      await new Promise(resolve => setTimeout(resolve, 5));
      expect(taskManager.activeCount).toBe(2);

      taskManager.abortAll();

      const results = await Promise.allSettled([p1, p2]);

      expect(mockWorkerInstances.length).toBe(2);
      for (const worker of mockWorkerInstances) {
        expect(worker._terminated).toBe(true);
      }
      expect(taskManager.activeCount).toBe(0);

      // Both should have been aborted
      for (const r of results) {
        expect(r.status).toBe('fulfilled');
        if (r.status === 'fulfilled') {
          expect(r.value).toContain('Worker aborted');
        }
      }
    });

    it('should record peak concurrent workers', async () => {
      const tool = createAgentTool(context, taskManager);

      const p1 = tool.execute!({ prompt: 'a', type: 'explore' }, {} as any);
      const p2 = tool.execute!({ prompt: 'b', type: 'explore' }, {} as any);
      const p3 = tool.execute!({ prompt: 'c', type: 'explore' }, {} as any);

      // Disable auto-respond
      for (const w of mockWorkerInstances) {
        w._disableAutoRespond();
      }

      await new Promise(resolve => setTimeout(resolve, 5));
      expect(taskManager.peakConcurrent).toBe(3);

      taskManager.abortAll();
      await Promise.allSettled([p1, p2, p3]);
    });
  });
});
