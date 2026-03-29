/**
 * Dispatcher - 统一任务执行器测试
 *
 * Mock 所有外部依赖，验证统一执行逻辑。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Dispatcher } from '../../../src/agents/dispatch/Dispatcher.js';
import type { AgentContext, AgentCapability } from '../../../src/agents/core/types.js';

/**
 * 创建 mock capabilities
 */
function createMockCapabilities() {
  return {
    workflow: {
      name: 'workflow',
      run: vi.fn(async (task: string) => ({
        text: `Result: ${task.slice(0, 30)}`,
        tools: ['Read', 'Grep'],
        success: true,
        usage: { input: 1000, output: 500 },
        duration: 100,
      })),
      initialize: vi.fn(),
    },
  };
}

type MockCapabilities = ReturnType<typeof createMockCapabilities>;

/**
 * 创建 mock AgentContext
 */
function createMockContext(caps: MockCapabilities) {
  const capMap: Record<string, AgentCapability> = {
    workflow: caps.workflow as unknown as AgentCapability,
  };

  return {
    runner: {
      execute: vi.fn(async (_agent: string, prompt: string) => ({
        text: `Response to: ${prompt.slice(0, 50)}`,
        tools: ['Read', 'Grep'],
        success: true,
        usage: { input: 100, output: 50 },
      })),
    },
    providerManager: {
      getActiveProvider: vi.fn(() => ({ baseUrl: 'https://api.example.com', apiKey: 'test-key' })),
    },
    hookRegistry: {
      getSessionId: vi.fn(() => 'test-session'),
      emit: vi.fn(),
    },
    skillRegistry: { size: 0, match: vi.fn(() => null), generateSkillInstruction: vi.fn(() => '') },
    timeoutCap: { getConfig: () => ({ heartbeatInterval: 30000, stallTimeout: 60000 }), startHeartbeat: vi.fn(), stopHeartbeat: vi.fn() },
    getCapability: vi.fn((name: string) => capMap[name] ?? null),
    getActiveProvider: vi.fn(() => ({ baseUrl: 'https://api.example.com', apiKey: 'test-key', model: 'claude-haiku-4-5' })),
  } as unknown as AgentContext;
}

describe('Dispatcher', () => {
  let dispatcher: Dispatcher;
  let ctx: AgentContext;
  let caps: MockCapabilities;

  beforeEach(() => {
    caps = createMockCapabilities();
    ctx = createMockContext(caps);
    dispatcher = new Dispatcher(ctx);
  });

  describe('基本执行', () => {
    it('should call workflow.run with the task', async () => {
      const result = await dispatcher.dispatch('test task');

      expect(result.success).toBe(true);
      expect(caps.workflow.run).toHaveBeenCalledWith('test task', expect.any(Object));
    });

    it('should pass options to workflow.run', async () => {
      const onPhase = vi.fn();
      const onText = vi.fn();
      const onTool = vi.fn();

      await dispatcher.dispatch('test', { cwd: '/tmp', onPhase, onText, onTool, chatId: 'chat-1' });

      expect(caps.workflow.run).toHaveBeenCalledWith('test', expect.objectContaining({
        cwd: '/tmp',
        onPhase,
        onText,
        onTool,
      }));
    });
  });

  describe('cost estimation', () => {
    it('should include cost when usage and model are available', async () => {
      const result = await dispatcher.dispatch('test');

      expect(result.cost).toBeDefined();
      expect(result.cost!.input).toBeCloseTo(1000 / 1_000_000 * 0.25, 10);
      expect(result.cost!.output).toBeCloseTo(500 / 1_000_000 * 1.25, 10);
      expect(result.cost!.total).toBeCloseTo(result.cost!.input + result.cost!.output, 10);
    });

    it('should have undefined cost when no active provider model', async () => {
      const noModelCaps = createMockCapabilities();
      const noModelCtx = createMockContext(noModelCaps);
      noModelCtx.getActiveProvider = vi.fn(() => ({ baseUrl: 'https://api.example.com', apiKey: 'test-key' }));
      const noModelDispatcher = new Dispatcher(noModelCtx);

      const result = await noModelDispatcher.dispatch('test');
      expect(result.cost).toBeUndefined();
    });

    it('should have undefined cost for unknown model', async () => {
      const unknownModelCaps = createMockCapabilities();
      const unknownModelCtx = createMockContext(unknownModelCaps);
      unknownModelCtx.getActiveProvider = vi.fn(() => ({ baseUrl: 'https://api.example.com', apiKey: 'test-key', model: 'unknown-model' }));
      const unknownModelDispatcher = new Dispatcher(unknownModelCtx);

      const result = await unknownModelDispatcher.dispatch('test');
      expect(result.cost).toBeUndefined();
    });

    it('should have undefined cost when workflow has no usage', async () => {
      const noUsageCaps = createMockCapabilities();
      noUsageCaps.workflow.run = vi.fn(async (task: string) => ({
        text: `Result: ${task.slice(0, 30)}`,
        tools: [],
        success: true,
        duration: 50,
      }));
      const noUsageCtx = createMockContext(noUsageCaps);
      const noUsageDispatcher = new Dispatcher(noUsageCtx);

      const result = await noUsageDispatcher.dispatch('test');
      expect(result.cost).toBeUndefined();
    });
  });

  describe('DispatchResult format', () => {
    it('should have correct result structure', async () => {
      const result = await dispatcher.dispatch('test');

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('tools');
      expect(result).toHaveProperty('trace');
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.tools)).toBe(true);
    });

    it('should include trace events', async () => {
      const result = await dispatcher.dispatch('test');

      expect(result.trace).toBeDefined();
      expect(Array.isArray(result.trace)).toBe(true);

      const traceTypes = result.trace!.map((e) => e.type);
      expect(traceTypes).toContain('dispatch.start');
      expect(traceTypes).toContain('dispatch.complete');
    });

    it('should have dispatch.start as first trace event', async () => {
      const result = await dispatcher.dispatch('test');

      expect(result.trace![0].type).toBe('dispatch.start');
    });

    it('should have dispatch.complete as last trace event', async () => {
      const result = await dispatcher.dispatch('test');

      expect(result.trace![result.trace!.length - 1].type).toBe('dispatch.complete');
    });
  });

  describe('error handling', () => {
    it('should handle workflow failure gracefully', async () => {
      const errorCaps = createMockCapabilities();
      errorCaps.workflow.run = vi.fn(async () => ({ text: '', tools: [], success: false, error: 'Workflow error', duration: 10 }));
      const errorCtx = createMockContext(errorCaps);
      const errorDispatcher = new Dispatcher(errorCtx);

      const result = await errorDispatcher.dispatch('test');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow error');
    });

    it('should handle workflow exception gracefully', async () => {
      const errorCaps = createMockCapabilities();
      errorCaps.workflow.run = vi.fn(async () => { throw new Error('Execution failed'); });
      const errorCtx = createMockContext(errorCaps);
      const errorDispatcher = new Dispatcher(errorCtx);

      const result = await errorDispatcher.dispatch('test');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });
  });

  describe('input validation', () => {
    it('should return error for empty task', async () => {
      const result = await dispatcher.dispatch('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should return error for whitespace-only task', async () => {
      const result = await dispatcher.dispatch('   ');
      expect(result.success).toBe(false);
    });

    it('should not call workflow for empty task', async () => {
      await dispatcher.dispatch('');
      expect(caps.workflow.run).not.toHaveBeenCalled();
    });
  });

  describe('capability missing', () => {
    it('should return error when workflow capability not available', async () => {
      const noCapCtx = createMockContext(createMockCapabilities());
      noCapCtx.getCapability = vi.fn(() => null);
      const noCapDispatcher = new Dispatcher(noCapCtx);

      const result = await noCapDispatcher.dispatch('test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });
  });

  describe('session management', () => {
    it('should skip session management when no chatId', async () => {
      const result = await dispatcher.dispatch('test');
      expect(result.success).toBe(true);
    });

    it('should ensure session when chatId is provided', async () => {
      const mockSessionCap = {
        getCurrentSessionId: vi.fn(() => null),
        loadSession: vi.fn(async () => null),
        createSession: vi.fn(async () => ({})),
        addUserMessage: vi.fn(),
        addAssistantMessage: vi.fn(),
      };

      const sessionCtx = createMockContext(createMockCapabilities());
      (sessionCtx as any).getSessionCap = vi.fn(() => mockSessionCap);
      const sessionDispatcher = new Dispatcher(sessionCtx);

      await sessionDispatcher.dispatch('test', { chatId: 'chat-123' });

      expect(mockSessionCap.loadSession).toHaveBeenCalledWith('chat-123');
      expect(mockSessionCap.createSession).toHaveBeenCalledWith({ id: 'chat-123' });
    });

    it('should not create session when already loaded', async () => {
      const mockSessionCap = {
        getCurrentSessionId: vi.fn(() => 'chat-123'),
        loadSession: vi.fn(async () => null),
        createSession: vi.fn(async () => ({})),
        addUserMessage: vi.fn(),
        addAssistantMessage: vi.fn(),
      };

      const sessionCtx = createMockContext(createMockCapabilities());
      (sessionCtx as any).getSessionCap = vi.fn(() => mockSessionCap);
      const sessionDispatcher = new Dispatcher(sessionCtx);

      await sessionDispatcher.dispatch('test', { chatId: 'chat-123' });

      expect(mockSessionCap.loadSession).not.toHaveBeenCalled();
      expect(mockSessionCap.createSession).not.toHaveBeenCalled();
    });

    it('should persist conversation to session on success', async () => {
      const mockSessionCap = {
        getCurrentSessionId: vi.fn(() => 'chat-123'),
        loadSession: vi.fn(async () => null),
        createSession: vi.fn(async () => ({})),
        addUserMessage: vi.fn(),
        addAssistantMessage: vi.fn(),
      };

      const sessionCtx = createMockContext(createMockCapabilities());
      (sessionCtx as any).getSessionCap = vi.fn(() => mockSessionCap);
      const sessionDispatcher = new Dispatcher(sessionCtx);

      await sessionDispatcher.dispatch('test');

      expect(mockSessionCap.addUserMessage).toHaveBeenCalledWith('test');
      expect(mockSessionCap.addAssistantMessage).toHaveBeenCalled();
    });
  });

  describe('trace persistence', () => {
    it('should persist trace to SessionManager after dispatch', async () => {
      const mockSaveTrace = vi.fn();
      const traceCaps = createMockCapabilities();
      const traceCtx = createMockContext(traceCaps);
      (traceCtx as any).getSessionCap = vi.fn(() => ({
        saveTrace: mockSaveTrace,
        getMessages: vi.fn(() => []),
        addUserMessage: vi.fn(),
        addAssistantMessage: vi.fn(),
      }));
      const traceDispatcher = new Dispatcher(traceCtx);

      await traceDispatcher.dispatch('test task');

      expect(mockSaveTrace).toHaveBeenCalledOnce();
      const savedTrace = mockSaveTrace.mock.calls[0][0];
      expect(Array.isArray(savedTrace)).toBe(true);
      expect(savedTrace.length).toBeGreaterThan(0);

      const types = savedTrace.map((e: any) => e.type);
      expect(types).toContain('dispatch.start');
      expect(types).toContain('dispatch.complete');
    });

    it('should include duration in dispatch.complete trace event', async () => {
      const result = await dispatcher.dispatch('test');

      const completeEvent = result.trace!.find((e) => e.type === 'dispatch.complete');
      expect(completeEvent).toBeDefined();
      expect(completeEvent!.duration).toBeDefined();
      expect(typeof completeEvent!.duration).toBe('number');
      expect(completeEvent!.duration).toBeGreaterThanOrEqual(0);
    });

    it('should not throw when getSessionCap is undefined', async () => {
      const noSessionCtx = createMockContext(createMockCapabilities());
      (noSessionCtx as any).getSessionCap = undefined;
      const noSessionDispatcher = new Dispatcher(noSessionCtx);

      const result = await noSessionDispatcher.dispatch('test');
      expect(result.success).toBe(true);
    });

    it('should not throw when saveTrace fails', async () => {
      const failingSaveTrace = vi.fn().mockRejectedValue(new Error('DB error'));
      const failCaps = createMockCapabilities();
      const failCtx = createMockContext(failCaps);
      (failCtx as any).getSessionCap = vi.fn(() => ({
        saveTrace: failingSaveTrace,
        getMessages: vi.fn(() => []),
        addUserMessage: vi.fn(),
        addAssistantMessage: vi.fn(),
      }));
      const failDispatcher = new Dispatcher(failCtx);

      const result = await failDispatcher.dispatch('test');
      expect(result.success).toBe(true);
    });
  });
});
