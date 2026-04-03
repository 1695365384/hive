/**
 * CoordinatorCapability 单元测试
 *
 * 测试 Coordinator + Worker 模式的协调者能力。
 * Mock LLMRuntime 和所有外部依赖。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockAgentContext,
  createTestProviderConfig,
  createTestSkill,
} from '../../mocks/agent-context.mock.js';
import type { AgentContext } from '../../../src/agents/core/types.js';

// Mock LLMRuntime
const mockRuntimeRun = vi.fn();
const mockRuntimeStream = vi.fn();
vi.mock('../../../src/agents/runtime/LLMRuntime.js', () => {
  return {
    LLMRuntime: class MockLLMRuntime {
      run = mockRuntimeRun;
      stream = mockRuntimeStream;
    },
  };
});

// Import after mock setup
import { CoordinatorCapability } from '../../../src/agents/capabilities/CoordinatorCapability.js';

describe('CoordinatorCapability', () => {
  let capability: CoordinatorCapability;
  let context: AgentContext;

  const testProvider = createTestProviderConfig({
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'test-api-key',
    model: 'deepseek-chat',
  });

  const testSkill = createTestSkill({
    metadata: {
      name: 'Code Review',
      description: 'Review code quality',
      version: '1.0.0',
      tags: ['review'],
    },
    body: '# Code Review\n\nReview code for quality.',
  });

  const defaultRuntimeResult = {
    text: 'Task completed successfully',
    tools: ['agent', 'task-stop'],
    success: true,
    usage: { promptTokens: 200, completionTokens: 100 },
    steps: [],
    duration: 100,
  };

function mockRuntimeWithText(text: string, resultOverride?: Partial<typeof defaultRuntimeResult>) {
    return (_config: any) => {
      let resolveResult!: (result: any) => void;
      const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
      const events = (async function* () {
        yield { type: 'text-delta', text };
        resolveResult({ ...defaultRuntimeResult, ...resultOverride });
      })();
      return { events, result: resultPromise };
    };
  }

  function mockRuntimeWithToolCall(toolName: string, input: unknown, resultOverride?: Partial<typeof defaultRuntimeResult>) {
    return (_config: any) => {
      let resolveResult!: (result: any) => void;
      const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
      const events = (async function* () {
        yield { type: 'tool-call', toolName, input };
        yield { type: 'tool-result', toolName, output: 'result' };
        resolveResult({ ...defaultRuntimeResult, ...resultOverride });
      })();
      return { events, result: resultPromise };
    };
  }

  function mockRuntimeWithToolResult(toolName: string, output: unknown, resultOverride?: Partial<typeof defaultRuntimeResult>) {
    return (_config: any) => {
      let resolveResult!: (result: any) => void;
      const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
      const events = (async function* () {
        yield { type: 'tool-call', toolName, input: {} };
        yield { type: 'tool-result', toolName, output };
        resolveResult({ ...defaultRuntimeResult, ...resultOverride });
      })();
      return { events, result: resultPromise };
    };
  }

  function createContext(overrides?: any) {
    return createMockAgentContext({
      activeProvider: testProvider,
      providers: [testProvider],
      skills: [testSkill],
      skillMatchResult: null,
      ...overrides,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRuntimeStream.mockImplementation(mockRuntimeWithText('Task completed successfully'));

    capability = new CoordinatorCapability();
    context = createContext();
    capability.initialize(context);
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('生命周期', () => {
    it('should initialize with correct name', () => {
      expect(capability.name).toBe('coordinator');
    });

    it('should expose TaskManager', () => {
      const tm = capability.getTaskManager();
      expect(tm).toBeDefined();
      expect(tm.register).toBeDefined();
      expect(tm.abort).toBeDefined();
      expect(tm.abortAll).toBeDefined();
    });
  });

  // ============================================
  // run() 基础测试
  // ============================================

  describe('run()', () => {
    it('should run task and return result', async () => {
      const result = await capability.run('Implement a feature');

      expect(result.success).toBe(true);
      expect(result.text).toBe('Task completed successfully');
      expect(result.tools).toEqual(['agent', 'task-stop']);
    });

    it('should call LLMRuntime.stream with correct config', async () => {
      await capability.run('Implement a feature');

      expect(mockRuntimeStream).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Implement a feature',
          maxSteps: 30,
        }),
      );
    });

    it('should pass system prompt to runtime', async () => {
      await capability.run('Implement a feature');

      const callArgs = mockRuntimeStream.mock.calls[0][0];
      expect(callArgs.system).toBeDefined();
      expect(typeof callArgs.system).toBe('string');
      expect(callArgs.system.length).toBeGreaterThan(0);
    });

    it('should only have coordinator tools (agent, task-stop, send-message)', async () => {
      let capturedTools: Record<string, any> = {};
      mockRuntimeStream.mockImplementation((config: any) => {
        capturedTools = config.tools;
        return mockRuntimeWithText('result')(config);
      });

      await capability.run('test task');

      expect(Object.keys(capturedTools)).toEqual(['agent', 'task-stop', 'send-message']);
    });

    it('should return empty result for empty task', async () => {
      const result = await capability.run('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task is empty');
      expect(result.text).toBe('');
      expect(mockRuntimeStream).not.toHaveBeenCalled();
    });

    it('should return empty result for whitespace-only task', async () => {
      const result = await capability.run('   ');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task is empty');
    });

    it('should include duration in result', async () => {
      const result = await capability.run('Test task');

      expect(result.duration).toBeDefined();
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include usage in result', async () => {
      const result = await capability.run('Test task');

      expect(result.usage).toBeDefined();
      expect(result.usage!.input).toBe(200);
      expect(result.usage!.output).toBe(100);
    });
  });

  // ============================================
  // Hook 测试
  // ============================================

  describe('hooks', () => {
    it('should trigger workflow:phase hooks', async () => {
      const phases: string[] = [];
      vi.mocked(context.hookRegistry.emit).mockImplementation(async (type, ctx: any) => {
        if (type === 'workflow:phase') {
          phases.push(ctx.phase);
        }
        return true;
      });

      await capability.run('Test task');

      expect(phases).toContain('execute');
      expect(phases).toContain('complete');
    });

    it('should call onPhase callback', async () => {
      const phases: Array<{ phase: string; message: string }> = [];

      await capability.run('Test task', {
        onPhase: (phase, message) => phases.push({ phase, message }),
      });

      expect(phases.length).toBeGreaterThan(0);
      expect(phases.some(p => p.phase === 'execute')).toBe(true);
      expect(phases.some(p => p.phase === 'complete')).toBe(true);
    });

    it('should trigger error phase on failure', async () => {
      const phases: string[] = [];
      vi.mocked(context.hookRegistry.emit).mockImplementation(async (type, ctx: any) => {
        if (type === 'workflow:phase') {
          phases.push(ctx.phase);
        }
        return true;
      });
      mockRuntimeStream.mockImplementation((_config: any) => {
        let resolveResult!: (result: any) => void;
        const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
        const events = (async function* () {
          throw new Error('Failed');
        })();
        return { events, result: resultPromise };
      });

      await capability.run('Test task');

      expect(phases).toContain('error');
    });

    it('should emit tool:before and tool:after hooks', async () => {
      mockRuntimeStream.mockImplementation((_config: any) => {
        let resolveResult!: (result: any) => void;
        const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
        const events = (async function* () {
          yield { type: 'tool-call', toolName: 'agent', input: { type: 'explore', prompt: 'test' } };
          yield { type: 'tool-result', toolName: 'agent', output: 'Worker result' };
          resolveResult(defaultRuntimeResult);
        })();
        return { events, result: resultPromise };
      });

      await capability.run('Test task');

      const emitCalls = vi.mocked(context.hookRegistry.emit).mock.calls;
      expect(emitCalls.some(c => c[0] === 'tool:before')).toBe(true);
      expect(emitCalls.some(c => c[0] === 'tool:after')).toBe(true);
    });

    it('should emit notification:push hooks', async () => {
      await capability.run('Test task');

      const emitCalls = vi.mocked(context.hookRegistry.emit).mock.calls;
      const notificationCalls = emitCalls.filter(c => c[0] === 'notification:push');
      expect(notificationCalls.length).toBeGreaterThanOrEqual(2); // start + complete
    });
  });

  // ============================================
  // Streaming callbacks 测试
  // ============================================

  describe('streaming callbacks', () => {
    it('should call onText callback with streaming text', async () => {
      const texts: string[] = [];
      mockRuntimeStream.mockImplementation((_config: any) => {
        let resolveResult!: (result: any) => void;
        const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
        const events = (async function* () {
          yield { type: 'text-delta', text: 'Hello ' };
          yield { type: 'text-delta', text: 'World' };
          resolveResult(defaultRuntimeResult);
        })();
        return { events, result: resultPromise };
      });

      await capability.run('Test task', {
        onText: (text) => texts.push(text),
      });

      expect(texts).toEqual(['Hello ', 'World']);
    });

    it('should call onTool callback during execution', async () => {
      mockRuntimeStream.mockImplementation((_config: any) => {
        let resolveResult!: (result: any) => void;
        const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
        const events = (async function* () {
          yield { type: 'tool-call', toolName: 'agent', input: { type: 'explore', prompt: 'Find files' } };
          yield { type: 'tool-result', toolName: 'agent', output: '' };
          resolveResult(defaultRuntimeResult);
        })();
        return { events, result: resultPromise };
      });

      const tools: Array<{ name: string; input: unknown }> = [];
      await capability.run('Test task', {
        onTool: (name, input) => tools.push({ name, input }),
      });
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0].name).toBe('agent');
    });

    it('should call onToolResult callback during execution', async () => {
      mockRuntimeStream.mockImplementation((_config: any) => {
        let resolveResult!: (result: any) => void;
        const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
        const events = (async function* () {
          yield { type: 'tool-call', toolName: 'agent', input: {} };
          yield { type: 'tool-result', toolName: 'agent', output: 'Worker completed' };
          resolveResult(defaultRuntimeResult);
        })();
        return { events, result: resultPromise };
      });

      const results: Array<{ name: string; result: unknown }> = [];
      await capability.run('Test task', {
        onToolResult: (name, result) => results.push({ name, result }),
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('agent');
    });
  });

  // ============================================
  // Heartbeat 测试
  // ============================================

  describe('heartbeat', () => {
    it('should start and stop heartbeat', async () => {
      await capability.run('Test task');

      expect(context.timeoutCap.startHeartbeat).toHaveBeenCalled();
      expect(context.timeoutCap.stopHeartbeat).toHaveBeenCalled();
    });

    it('should update activity on tool result', async () => {
      mockRuntimeStream.mockImplementation((_config: any) => {
        let resolveResult!: (result: any) => void;
        const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
        const events = (async function* () {
          yield { type: 'tool-call', toolName: 'agent', input: {} };
          yield { type: 'tool-result', toolName: 'agent', output: 'result' };
          resolveResult(defaultRuntimeResult);
        })();
        return { events, result: resultPromise };
      });

      await capability.run('Test task');
      expect(context.timeoutCap.updateActivity).toHaveBeenCalled();
    });
  });

  // ============================================
  // 语言检测测试
  // ============================================

  describe('system prompt', () => {
    it('should use coordinator.md template', async () => {
      await capability.run('Implement a feature');

      const callArgs = mockRuntimeStream.mock.calls[0][0];
      expect(callArgs.system).toContain('Coordinator');
    });

    it('should inject task into system prompt', async () => {
      await capability.run('Implement a feature');

      const callArgs = mockRuntimeStream.mock.calls[0][0];
      expect(callArgs.system).toContain('Implement a feature');
    });
  });

  // ============================================
  // Session 持久化测试
  // ============================================

  describe('session persistence', () => {
    it('should persist user message and assistant response on success', async () => {
      const mockAddUserMessage = vi.fn().mockResolvedValue(undefined);
      const mockAddAssistantMessage = vi.fn().mockResolvedValue(undefined);

      const sessionContext = createContext();
      (sessionContext as any).getSessionCap = vi.fn(() => ({
        getMessages: vi.fn(() => []),
        getCurrentSessionId: vi.fn(() => 'session-123'),
        loadSession: vi.fn().mockResolvedValue(true),
        createSession: vi.fn().mockResolvedValue(undefined),
        addUserMessage: mockAddUserMessage,
        addAssistantMessage: mockAddAssistantMessage,
      }));

      const coordCap = new CoordinatorCapability();
      coordCap.initialize(sessionContext);

      await coordCap.run('test task');

      expect(mockAddUserMessage).toHaveBeenCalledWith('test task');
      expect(mockAddAssistantMessage).toHaveBeenCalledWith('Task completed successfully');
    });

    it('should not persist on failure', async () => {
      mockRuntimeStream.mockImplementation((_config: any) => {
        let resolveResult!: (result: any) => void;
        const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
        const events = (async function* () {
          throw new Error('Failed');
        })();
        return { events, result: resultPromise };
      });

      const mockAddUserMessage = vi.fn();
      const sessionContext = createContext();
      (sessionContext as any).getSessionCap = vi.fn(() => ({
        getMessages: vi.fn(() => []),
        addUserMessage: mockAddUserMessage,
      }));

      const coordCap = new CoordinatorCapability();
      coordCap.initialize(sessionContext);

      await coordCap.run('test task');

      expect(mockAddUserMessage).not.toHaveBeenCalled();
    });

    it('should load session history when available', async () => {
      const sessionContext = createContext();
      (sessionContext as any).getSessionCap = vi.fn(() => ({
        getMessages: vi.fn(() => [
          { role: 'user', content: 'previous message' },
          { role: 'assistant', content: 'previous response' },
        ]),
      }));

      const coordCap = new CoordinatorCapability();
      coordCap.initialize(sessionContext);

      await coordCap.run('new task');

      const callArgs = mockRuntimeStream.mock.calls[0][0];
      expect(callArgs.messages).toBeDefined();
      expect(callArgs.messages.length).toBe(3);
      expect(callArgs.prompt).toBeUndefined();
    });

    it('should use prompt when no session history', async () => {
      await capability.run('test task');

      const callArgs = mockRuntimeStream.mock.calls[0][0];
      expect(callArgs.prompt).toBe('test task');
      expect(callArgs.messages).toBeUndefined();
    });
  });

  // ============================================
  // Error handling 测试
  // ============================================

  describe('error handling', () => {
    it('should handle Error exceptions', async () => {
      mockRuntimeStream.mockImplementation((_config: any) => {
        let resolveResult!: (result: any) => void;
        const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
        const events = (async function* () {
          throw new Error('Execution failed');
        })();
        return { events, result: resultPromise };
      });

      const result = await capability.run('Test task');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });

    it('should handle non-Error exceptions', async () => {
      mockRuntimeStream.mockImplementation((_config: any) => {
        let resolveResult!: (result: any) => void;
        const resultPromise = new Promise<any>((resolve) => { resolveResult = resolve; });
        const events = (async function* () {
          throw 'String error';
        })();
        return { events, result: resultPromise };
      });

      const result = await capability.run('Test task');

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });
  });

  // ============================================
  // Cost calculation 测试
  // ============================================

  describe('cost calculation', () => {
    it('should calculate cost when model is known', async () => {
      const result = await capability.run('Test task');

      // deepseek-chat has pricing data
      expect(result.cost).toBeDefined();
      expect(typeof result.cost!.total).toBe('number');
    });

    it('should not include cost when model is unknown', async () => {
      const noModelContext = createContext({ activeProvider: null });
      const noModelCap = new CoordinatorCapability();
      noModelCap.initialize(noModelContext);

      const result = await noModelCap.run('Test task');

      expect(result.cost).toBeUndefined();
    });
  });
});
