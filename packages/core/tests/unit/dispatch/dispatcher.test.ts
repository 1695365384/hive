/**
 * Dispatcher 路由器测试
 *
 * Mock 所有外部依赖，验证路由逻辑。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Dispatcher } from '../../../src/agents/dispatch/Dispatcher.js';
import type { AgentContext, AgentCapability } from '../../../src/agents/core/types.js';
import {
  classifyForDispatch,
  regexClassify,
} from '../../../src/agents/dispatch/classifier.js';

vi.mock('../../../src/agents/dispatch/classifier.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/agents/dispatch/classifier.js')>();
  return {
    classifyForDispatch: vi.fn(),
    regexClassify: actual.regexClassify,
  };
});

/**
 * 创建 mock capabilities
 */
function createMockCapabilities() {
  return {
    chat: {
      name: 'chat',
      send: vi.fn(async (prompt: string) => `Chat: ${prompt.slice(0, 30)}`),
      initialize: vi.fn(),
    },
    workflow: {
      name: 'workflow',
      run: vi.fn(async (task: string) => ({
        analysis: { type: 'moderate' as const, needsExploration: false, needsPlanning: false, recommendedAgents: [], reason: '' },
        executeResult: { text: `Workflow: ${task.slice(0, 30)}`, tools: [], success: true, usage: { input: 1000, output: 500 } },
        success: true,
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
    chat: caps.chat as unknown as AgentCapability,
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

  describe('forceLayer option', () => {
    it('should skip classification and route to chat', async () => {
      const result = await dispatcher.dispatch('anything', { forceLayer: 'chat' });
      expect(result.layer).toBe('chat');
      expect(result.success).toBe(true);
      expect(caps.chat.send).toHaveBeenCalledWith('anything', expect.any(Object));
    });

    it('should skip classification and route to workflow', async () => {
      const result = await dispatcher.dispatch('anything', { forceLayer: 'workflow' });
      expect(result.layer).toBe('workflow');
      expect(result.success).toBe(true);
      expect(caps.workflow.run).toHaveBeenCalledWith('anything', expect.any(Object));
    });

    it('should set confidence to 1.0 for forced layer', async () => {
      const result = await dispatcher.dispatch('test', { forceLayer: 'workflow' });
      expect(result.classification.confidence).toBe(1.0);
      expect(result.classification.reason).toContain('Forced layer');
    });

    it('should fallback to chat for invalid forceLayer', async () => {
      const result = await dispatcher.dispatch('test', { forceLayer: 'invalid' as any });
      expect(result.layer).toBe('chat');
      expect(result.classification.confidence).toBe(1.0);
    });
  });

  describe('cost estimation', () => {
    it('should include cost for workflow dispatch with usage', async () => {
      const result = await dispatcher.dispatch('test', { forceLayer: 'workflow' });
      expect(result.cost).toBeDefined();
      expect(result.cost!.input).toBeCloseTo(1000 / 1_000_000 * 0.25, 10);
      expect(result.cost!.output).toBeCloseTo(500 / 1_000_000 * 1.25, 10);
      expect(result.cost!.total).toBeCloseTo(result.cost!.input + result.cost!.output, 10);
    });

    it('should have undefined cost for chat dispatch (no usage from send)', async () => {
      const result = await dispatcher.dispatch('test', { forceLayer: 'chat' });
      expect(result.cost).toBeUndefined();
    });

    it('should have undefined cost when no active provider model', async () => {
      const noModelCaps = createMockCapabilities();
      const noModelCtx = createMockContext(noModelCaps);
      noModelCtx.getActiveProvider = vi.fn(() => ({ baseUrl: 'https://api.example.com', apiKey: 'test-key' }));
      const noModelDispatcher = new Dispatcher(noModelCtx);

      const result = await noModelDispatcher.dispatch('test', { forceLayer: 'workflow' });
      expect(result.cost).toBeUndefined();
    });

    it('should have undefined cost for unknown model', async () => {
      const unknownModelCaps = createMockCapabilities();
      const unknownModelCtx = createMockContext(unknownModelCaps);
      unknownModelCtx.getActiveProvider = vi.fn(() => ({ baseUrl: 'https://api.example.com', apiKey: 'test-key', model: 'unknown-model' }));
      const unknownModelDispatcher = new Dispatcher(unknownModelCtx);

      const result = await unknownModelDispatcher.dispatch('test', { forceLayer: 'workflow' });
      expect(result.cost).toBeUndefined();
    });

    it('should have undefined cost when workflow has no usage', async () => {
      const noUsageCaps = createMockCapabilities();
      noUsageCaps.workflow.run = vi.fn(async (task: string) => ({
        analysis: { type: 'moderate' as const, needsExploration: false, needsPlanning: false, recommendedAgents: [], reason: '' },
        executeResult: { text: `Workflow: ${task.slice(0, 30)}`, tools: [], success: true },
        success: true,
      }));
      const noUsageCtx = createMockContext(noUsageCaps);
      const noUsageDispatcher = new Dispatcher(noUsageCtx);

      const result = await noUsageDispatcher.dispatch('test', { forceLayer: 'workflow' });
      expect(result.cost).toBeUndefined();
    });
  });

  describe('DispatchResult format', () => {
    it('should have correct result structure', async () => {
      const result = await dispatcher.dispatch('test', { forceLayer: 'chat' });

      expect(result).toHaveProperty('layer');
      expect(result).toHaveProperty('classification');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('duration');
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include classification details', async () => {
      const result = await dispatcher.dispatch('test', { forceLayer: 'workflow' });

      expect(result.classification).toHaveProperty('layer');
      expect(result.classification).toHaveProperty('taskType');
      expect(result.classification).toHaveProperty('complexity');
      expect(result.classification).toHaveProperty('confidence');
      expect(result.classification).toHaveProperty('reason');
    });
  });

  describe('fallback chain', () => {
    it('should fallback to chat when workflow fails', async () => {
      const failingCaps = createMockCapabilities();
      failingCaps.workflow.run = vi.fn(async () => { throw new Error('Workflow execution failed'); });
      const failingCtx = createMockContext(failingCaps);
      const failingDispatcher = new Dispatcher(failingCtx);

      const result = await failingDispatcher.dispatch('test', { forceLayer: 'workflow' });
      expect(result.layer).toBe('chat');
      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw when chat fails with forceLayer=chat', async () => {
      const errorCaps = createMockCapabilities();
      errorCaps.chat.send = vi.fn(async () => { throw new Error('Chat failed'); });
      const errorCtx = createMockContext(errorCaps);
      const errorDispatcher = new Dispatcher(errorCtx);

      await expect(errorDispatcher.dispatch('test', { forceLayer: 'chat' })).rejects.toThrow('Chat failed');
    });

    it('should handle workflow failure gracefully', async () => {
      const errorCaps = createMockCapabilities();
      errorCaps.workflow.run = vi.fn(async () => ({ success: false, error: 'Workflow error', analysis: { type: 'simple' as const, needsExploration: false, needsPlanning: false, recommendedAgents: [], reason: '' } }));
      const errorCtx = createMockContext(errorCaps);
      const errorDispatcher = new Dispatcher(errorCtx);

      const result = await errorDispatcher.dispatch('test', { forceLayer: 'workflow' });
      expect(result.success).toBe(false);
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
  });

  describe('capability missing', () => {
    it('should return error when chat capability not available', async () => {
      const noCapCtx = createMockContext(createMockCapabilities());
      noCapCtx.getCapability = vi.fn(() => null);
      const noCapDispatcher = new Dispatcher(noCapCtx);

      const result = await noCapDispatcher.dispatch('test', { forceLayer: 'chat' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return error when workflow capability not available', async () => {
      const noCapCtx = createMockContext(createMockCapabilities());
      noCapCtx.getCapability = vi.fn(() => null);
      const noCapDispatcher = new Dispatcher(noCapCtx);

      const result = await noCapDispatcher.dispatch('test', { forceLayer: 'workflow' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });
  });

  describe('classification path', () => {
    let classifyCaps: MockCapabilities;
    let classifyCtx: AgentContext;
    let classifyDispatcher: Dispatcher;

    beforeEach(() => {
      classifyCaps = createMockCapabilities();
      classifyCtx = createMockContext(classifyCaps);
      classifyDispatcher = new Dispatcher(classifyCtx);
    });

    afterEach(() => {
      vi.mocked(classifyForDispatch).mockReset();
    });

    it('should route to chat when LLM returns high-confidence chat classification', async () => {
      vi.mocked(classifyForDispatch).mockResolvedValue({
        classification: {
          layer: 'chat',
          taskType: 'general',
          complexity: 'simple',
          confidence: 0.9,
          reason: 'Simple greeting detected by LLM',
        },
        trace: [
          {
            timestamp: Date.now(),
            type: 'dispatch.classify',
            layer: 'chat',
            confidence: 0.9,
            latency: 50,
            reason: 'Simple greeting detected by LLM',
          },
        ],
      });

      const result = await classifyDispatcher.dispatch('Hello, how are you? I was wondering about the project architecture');

      expect(result.layer).toBe('chat');
      expect(result.success).toBe(true);
      expect(result.classification.confidence).toBe(0.9);
      expect(result.classification.layer).toBe('chat');
      expect(classifyCaps.chat.send).toHaveBeenCalledWith('Hello, how are you? I was wondering about the project architecture', expect.any(Object));
      expect(classifyCaps.workflow.run).not.toHaveBeenCalled();
    });

    it('should route to workflow when LLM returns high-confidence workflow classification', async () => {
      vi.mocked(classifyForDispatch).mockResolvedValue({
        classification: {
          layer: 'workflow',
          taskType: 'code-task',
          complexity: 'complex',
          confidence: 0.85,
          reason: 'Multi-step refactoring task detected by LLM',
        },
        trace: [
          {
            timestamp: Date.now(),
            type: 'dispatch.classify',
            layer: 'workflow',
            confidence: 0.85,
            latency: 80,
            reason: 'Multi-step refactoring task detected by LLM',
          },
        ],
      });

      const result = await classifyDispatcher.dispatch('Please refactor the authentication module to use OAuth 2.0');

      expect(result.layer).toBe('workflow');
      expect(result.success).toBe(true);
      expect(result.classification.confidence).toBe(0.85);
      expect(result.classification.layer).toBe('workflow');
      expect(classifyCaps.workflow.run).toHaveBeenCalledWith(
        'Please refactor the authentication module to use OAuth 2.0',
        expect.any(Object),
      );
      expect(classifyCaps.chat.send).not.toHaveBeenCalled();
    });

    it('should fall back to regexClassify when LLM confidence is below threshold', async () => {
      vi.mocked(classifyForDispatch).mockResolvedValue({
        classification: {
          layer: 'chat',
          taskType: 'general',
          complexity: 'simple',
          confidence: 0.3,
          reason: 'Uncertain classification',
        },
        trace: [
          {
            timestamp: Date.now(),
            type: 'dispatch.classify',
            layer: 'chat',
            confidence: 0.3,
            latency: 60,
            reason: 'Uncertain classification',
          },
        ],
      });

      const onPhase = vi.fn();
      // "实现" triggers regexClassify code-task keywords
      const result = await classifyDispatcher.dispatch('请实现用户登录功能', { onPhase });

      // regexClassify should detect code-task keywords and route to workflow
      expect(result.layer).toBe('workflow');
      expect(result.classification.confidence).toBeLessThan(0.5);
      expect(result.classification.reason).toBe('Code task keywords detected');
      expect(onPhase).toHaveBeenCalledWith(
        'classify',
        expect.stringContaining('LLM confidence low'),
      );
    });

    it('should fall back to regexClassify when LLM throws an error', async () => {
      vi.mocked(classifyForDispatch).mockRejectedValue(new Error('LLM service unavailable'));

      const onPhase = vi.fn();
      // "修复" triggers regexClassify code-task keywords
      const result = await classifyDispatcher.dispatch('修复登录页面的 bug', { onPhase });

      // regexClassify should detect code-task keywords and route to workflow
      expect(result.layer).toBe('workflow');
      expect(result.classification.confidence).toBeLessThan(0.5);
      expect(result.classification.reason).toBe('Code task keywords detected');
      expect(classifyCaps.workflow.run).toHaveBeenCalled();
    });

    it('should invoke onPhase callback during classification fallback', async () => {
      vi.mocked(classifyForDispatch).mockResolvedValue({
        classification: {
          layer: 'chat',
          taskType: 'general',
          complexity: 'simple',
          confidence: 0.1,
          reason: 'Very uncertain',
        },
        trace: [],
      });

      const onPhase = vi.fn();
      await classifyDispatcher.dispatch('实现一个新功能', { onPhase });

      // onPhase should have been called with 'classify' phase for the low-confidence fallback
      expect(onPhase).toHaveBeenCalledWith(
        'classify',
        expect.stringContaining('LLM confidence low'),
      );
      // onPhase should also be called with 'execute' phase when the chosen layer executes
      expect(onPhase).toHaveBeenCalledWith(
        'execute',
        expect.stringContaining('workflow'),
      );
    });

    it('should include trace array with expected event types in classification path', async () => {
      vi.mocked(classifyForDispatch).mockResolvedValue({
        classification: {
          layer: 'chat',
          taskType: 'general',
          complexity: 'simple',
          confidence: 0.9,
          reason: 'Clear chat intent',
        },
        trace: [
          {
            timestamp: Date.now(),
            type: 'dispatch.classify',
            layer: 'chat',
            confidence: 0.9,
            latency: 42,
            reason: 'Clear chat intent',
          },
        ],
      });

      const result = await classifyDispatcher.dispatch('What is TypeScript and why should I use it for my next project?');

      // Trace must be present
      expect(result.trace).toBeDefined();
      expect(Array.isArray(result.trace)).toBe(true);

      // Verify key event types appear in trace
      const traceTypes = result.trace!.map((e) => e.type);
      expect(traceTypes).toContain('dispatch.start');
      expect(traceTypes).toContain('dispatch.classify');
      expect(traceTypes).toContain('dispatch.route');
      expect(traceTypes).toContain('dispatch.complete');

      // Verify dispatch.start is first
      expect(result.trace![0].type).toBe('dispatch.start');

      // Verify dispatch.complete is last
      expect(result.trace![result.trace!.length - 1].type).toBe('dispatch.complete');

      // Verify dispatch.route has correct layer
      const routeEvent = result.trace!.find((e) => e.type === 'dispatch.route');
      expect(routeEvent).toBeDefined();
      expect(routeEvent!.layer).toBe('chat');
      expect(routeEvent!.confidence).toBe(0.9);
    });

    it('should include trace with fallback events when LLM confidence is low', async () => {
      vi.mocked(classifyForDispatch).mockResolvedValue({
        classification: {
          layer: 'chat',
          taskType: 'general',
          complexity: 'simple',
          confidence: 0.2,
          reason: 'Low confidence from LLM',
        },
        trace: [
          {
            timestamp: Date.now(),
            type: 'dispatch.classify',
            layer: 'chat',
            confidence: 0.2,
            latency: 30,
            reason: 'Low confidence from LLM',
          },
        ],
      });

      // Use a code-task keyword to trigger regexClassify -> workflow
      const result = await classifyDispatcher.dispatch('请重构这个模块');

      expect(result.trace).toBeDefined();
      expect(Array.isArray(result.trace)).toBe(true);

      const traceTypes = result.trace!.map((e) => e.type);
      expect(traceTypes).toContain('dispatch.start');
      expect(traceTypes).toContain('dispatch.classify');
      expect(traceTypes).toContain('dispatch.route');
      expect(traceTypes).toContain('dispatch.complete');

      // After regex fallback, layer should be 'workflow'
      const routeEvent = result.trace!.find((e) => e.type === 'dispatch.route');
      expect(routeEvent!.layer).toBe('workflow');
    });

    it('should fall back to regexClassify when classifyForDispatch returns null', async () => {
      vi.mocked(classifyForDispatch).mockResolvedValue(null as any);

      // "实现" triggers regexClassify code-task keywords
      const result = await classifyDispatcher.dispatch('请实现用户登录功能');

      expect(result.layer).toBe('workflow');
      expect(result.classification.confidence).toBeLessThan(0.5);
      expect(result.classification.reason).toBe('Code task keywords detected');
      expect(classifyCaps.workflow.run).toHaveBeenCalled();
      expect(classifyCaps.chat.send).not.toHaveBeenCalled();
    });
  });

  describe('trace persistence', () => {
    it('should persist trace to SessionManager after dispatch', async () => {
      const mockSaveTrace = vi.fn();
      const traceCaps = createMockCapabilities();
      const traceCtx = createMockContext(traceCaps);
      (traceCtx as any).getSessionCap = vi.fn(() => ({ saveTrace: mockSaveTrace }));
      const traceDispatcher = new Dispatcher(traceCtx);

      await traceDispatcher.dispatch('test task', { forceLayer: 'chat' });

      expect(mockSaveTrace).toHaveBeenCalledOnce();
      const savedTrace = mockSaveTrace.mock.calls[0][0];
      expect(Array.isArray(savedTrace)).toBe(true);
      expect(savedTrace.length).toBeGreaterThan(0);

      const types = savedTrace.map((e: any) => e.type);
      expect(types).toContain('dispatch.start');
      expect(types).toContain('dispatch.complete');
    });

    it('should include duration in dispatch.complete trace event', async () => {
      const result = await dispatcher.dispatch('test', { forceLayer: 'chat' });

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

      // Should not throw
      const result = await noSessionDispatcher.dispatch('test', { forceLayer: 'chat' });
      expect(result.success).toBe(true);
    });

    it('should not throw when saveTrace fails', async () => {
      const failingSaveTrace = vi.fn().mockRejectedValue(new Error('DB error'));
      const failCaps = createMockCapabilities();
      const failCtx = createMockContext(failCaps);
      (failCtx as any).getSessionCap = vi.fn(() => ({ saveTrace: failingSaveTrace }));
      const failDispatcher = new Dispatcher(failCtx);

      // Should not throw even though saveTrace fails
      const result = await failDispatcher.dispatch('test', { forceLayer: 'chat' });
      expect(result.success).toBe(true);
    });
  });
});
