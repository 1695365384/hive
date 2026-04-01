/**
 * ExecutionCapability 单元测试
 *
 * 测试统一任务执行能力。
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
vi.mock('../../../src/agents/runtime/LLMRuntime.js', () => {
  return {
    LLMRuntime: class MockLLMRuntime {
      run = mockRuntimeRun;
    },
  };
});

// Import after mock setup
import { ExecutionCapability } from '../../../src/agents/capabilities/ExecutionCapability.js';
import type { DispatchOptions } from '../../../src/agents/capabilities/ExecutionCapability.js';

describe('ExecutionCapability', () => {
  let capability: ExecutionCapability;
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
    tools: ['Read', 'Write', 'Edit'],
    success: true,
    usage: { promptTokens: 200, completionTokens: 100 },
    steps: [],
    duration: 100,
  };

  /**
   * Helper: mock runtime.run to call onText callback
   */
  function mockRuntimeWithText(text: string, resultOverride?: Partial<typeof defaultRuntimeResult>) {
    return async (config: any) => {
      config.onText?.(text);
      return { ...defaultRuntimeResult, ...resultOverride };
    };
  }

  function createContext(overrides?: any) {
    const ctx = createMockAgentContext({
      activeProvider: testProvider,
      providers: [testProvider],
      skills: [testSkill],
      skillMatchResult: null,
      ...overrides,
    });
    // Mock ToolRegistry
    (ctx as any).runner = {
      ...ctx.runner,
      getToolRegistry: vi.fn(() => ({
        getToolsForAgent: vi.fn((agentType: string) => {
          if (agentType === 'explore') {
            return { file: {}, glob: {}, grep: {} };
          }
          return { bash: {}, file: {}, glob: {}, grep: {}, 'web-search': {}, 'web-fetch': {}, 'ask-user': {} };
        }),
        getToolDescriptions: vi.fn((agentType: string) => {
          if (agentType === 'explore') {
            return [
              { name: 'file', description: 'Read files' },
              { name: 'glob', description: 'Find files' },
            ];
          }
          return [
            { name: 'bash', description: 'Execute commands' },
            { name: 'file', description: 'Read/write files' },
          ];
        }),
      })),
    };
    return ctx;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRuntimeRun.mockImplementation(mockRuntimeWithText('Task completed successfully'));

    capability = new ExecutionCapability();
    context = createContext();
    capability.initialize(context);
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('生命周期', () => {
    it('should initialize with correct name', () => {
      expect(capability.name).toBe('execution');
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
      expect(result.tools).toEqual(['Read', 'Write', 'Edit']);
    });

    it('should call LLMRuntime.run with correct config', async () => {
      await capability.run('Implement a feature');

      expect(mockRuntimeRun).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Implement a feature',
          streaming: true,
          maxSteps: 30,
        }),
      );
    });

    it('should pass system prompt to runtime', async () => {
      await capability.run('Implement a feature');

      const callArgs = mockRuntimeRun.mock.calls[0][0];
      expect(callArgs.system).toBeDefined();
      expect(typeof callArgs.system).toBe('string');
      expect(callArgs.system.length).toBeGreaterThan(0);
    });

    it('should return empty result for empty task', async () => {
      const result = await capability.run('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task is empty');
      expect(result.text).toBe('');
      expect(mockRuntimeRun).not.toHaveBeenCalled();
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
      mockRuntimeRun.mockRejectedValue(new Error('Failed'));

      await capability.run('Test task');

      expect(phases).toContain('error');
    });

    it('should emit tool:before and tool:after hooks', async () => {
      mockRuntimeRun.mockImplementation(async (config: any) => {
        config.onToolCall?.('Read', { file_path: '/test.ts' });
        config.onToolResult?.('Read', 'file contents');
        return defaultRuntimeResult;
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
      mockRuntimeRun.mockImplementation(async (config: any) => {
        config.onText?.('Hello ');
        config.onText?.('World');
        return defaultRuntimeResult;
      });

      await capability.run('Test task', {
        onText: (text) => texts.push(text),
      });

      expect(texts).toEqual(['Hello ', 'World']);
    });

    it('should call onTool callback during execution', async () => {
      mockRuntimeRun.mockImplementation(async (config: any) => {
        config.onToolCall?.('Read', { file_path: '/test.ts' });
        return defaultRuntimeResult;
      });

      const tools: Array<{ name: string; input: unknown }> = [];
      await capability.run('Test task', {
        onTool: (name, input) => tools.push({ name, input }),
      });
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0].name).toBe('Read');
    });

    it('should call onToolResult callback during execution', async () => {
      mockRuntimeRun.mockImplementation(async (config: any) => {
        config.onToolResult?.('Read', 'file contents');
        return defaultRuntimeResult;
      });

      const results: Array<{ name: string; result: unknown }> = [];
      await capability.run('Test task', {
        onToolResult: (name, result) => results.push({ name, result }),
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Read');
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
      mockRuntimeRun.mockImplementation(async (config: any) => {
        config.onToolResult?.('Read', 'file contents');
        return defaultRuntimeResult;
      });

      await capability.run('Test task');
      expect(context.timeoutCap.updateActivity).toHaveBeenCalled();
    });
  });

  // ============================================
  // forceMode 测试
  // ============================================

  describe('forceMode', () => {
    it('normal mode should include subagent tools', async () => {
      let capturedTools: Record<string, any> = {};
      mockRuntimeRun.mockImplementation(async (config: any) => {
        capturedTools = config.tools;
        config.onText?.('result');
        return defaultRuntimeResult;
      });

      await capability.run('test task');

      expect(capturedTools).toHaveProperty('explore');
      expect(capturedTools).toHaveProperty('plan');
      expect(capturedTools).toHaveProperty('bash');
    });

    it('forceMode explore should use only read-only tools', async () => {
      let capturedTools: Record<string, any> = {};
      mockRuntimeRun.mockImplementation(async (config: any) => {
        capturedTools = config.tools;
        config.onText?.('result');
        return defaultRuntimeResult;
      });

      await capability.run('explore the codebase', { forceMode: 'explore' });

      expect(capturedTools).toHaveProperty('file');
      expect(capturedTools).toHaveProperty('glob');
      expect(capturedTools).toHaveProperty('grep');
      expect(capturedTools).not.toHaveProperty('bash');
      expect(capturedTools).not.toHaveProperty('explore');
      expect(capturedTools).not.toHaveProperty('plan');
    });

    it('forceMode plan should use only read-only tools', async () => {
      let capturedTools: Record<string, any> = {};
      mockRuntimeRun.mockImplementation(async (config: any) => {
        capturedTools = config.tools;
        config.onText?.('result');
        return defaultRuntimeResult;
      });

      await capability.run('plan the architecture', { forceMode: 'plan' });

      expect(capturedTools).toHaveProperty('file');
      expect(capturedTools).not.toHaveProperty('bash');
      expect(capturedTools).not.toHaveProperty('explore');
      expect(capturedTools).not.toHaveProperty('plan');
    });

    it('forceMode explore should use explore.md template', async () => {
      await capability.run('explore the codebase', { forceMode: 'explore' });

      const callArgs = mockRuntimeRun.mock.calls[0][0];
      // explore.md should be rendered as system prompt
      expect(callArgs.system).toBeDefined();
    });

    it('forceMode plan should use plan.md template', async () => {
      await capability.run('plan the architecture', { forceMode: 'plan' });

      const callArgs = mockRuntimeRun.mock.calls[0][0];
      expect(callArgs.system).toBeDefined();
    });
  });

  // ============================================
  // 语言检测测试
  // ============================================

  describe('语言检测', () => {
    it('should detect Chinese and add language instruction', async () => {
      await capability.run('帮我实现一个功能');

      const callArgs = mockRuntimeRun.mock.calls[0][0];
      expect(callArgs.system).toContain('中文');
    });

    it('should detect English and add language instruction', async () => {
      await capability.run('Implement a feature');

      const callArgs = mockRuntimeRun.mock.calls[0][0];
      expect(callArgs.system).toContain('English');
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

      const sessionCap = new ExecutionCapability();
      sessionCap.initialize(sessionContext);

      await sessionCap.run('test task');

      expect(mockAddUserMessage).toHaveBeenCalledWith('test task');
      expect(mockAddAssistantMessage).toHaveBeenCalledWith('Task completed successfully');
    });

    it('should not persist on failure', async () => {
      mockRuntimeRun.mockRejectedValue(new Error('Failed'));

      const mockAddUserMessage = vi.fn();
      const sessionContext = createContext();
      (sessionContext as any).getSessionCap = vi.fn(() => ({
        getMessages: vi.fn(() => []),
        addUserMessage: mockAddUserMessage,
      }));

      const sessionCap = new ExecutionCapability();
      sessionCap.initialize(sessionContext);

      await sessionCap.run('test task');

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

      const sessionCap = new ExecutionCapability();
      sessionCap.initialize(sessionContext);

      await sessionCap.run('new task');

      const callArgs = mockRuntimeRun.mock.calls[0][0];
      expect(callArgs.messages).toBeDefined();
      expect(callArgs.messages.length).toBe(3);
      expect(callArgs.prompt).toBeUndefined();
    });

    it('should use prompt when no session history', async () => {
      await capability.run('test task');

      const callArgs = mockRuntimeRun.mock.calls[0][0];
      expect(callArgs.prompt).toBe('test task');
      expect(callArgs.messages).toBeUndefined();
    });

    it('should ensure correct session is loaded for chatId', async () => {
      const mockLoadSession = vi.fn().mockResolvedValue(true);
      const sessionContext = createContext();
      (sessionContext as any).getSessionCap = vi.fn(() => ({
        getMessages: vi.fn(() => []),
        getCurrentSessionId: vi.fn(() => 'other-session'),
        loadSession: mockLoadSession,
      }));

      const sessionCap = new ExecutionCapability();
      sessionCap.initialize(sessionContext);

      await sessionCap.run('test task', { chatId: 'target-session' });

      expect(mockLoadSession).toHaveBeenCalledWith('target-session');
    });
  });

  // ============================================
  // External systemPrompt override 测试
  // ============================================

  describe('external systemPrompt', () => {
    it('should use external systemPrompt as base', async () => {
      await capability.run('test task', {
        systemPrompt: 'You are a helpful assistant.',
      });

      const callArgs = mockRuntimeRun.mock.calls[0][0];
      expect(callArgs.system).toContain('You are a helpful assistant.');
    });

    it('should append env/schedule/tools to external prompt', async () => {
      await capability.run('test task', {
        systemPrompt: 'Custom prompt.',
      });

      const callArgs = mockRuntimeRun.mock.calls[0][0];
      // DynamicPromptBuilder should append tool descriptions etc.
      expect(callArgs.system.length).toBeGreaterThan('Custom prompt.'.length);
    });
  });

  // ============================================
  // Error handling 测试
  // ============================================

  describe('error handling', () => {
    it('should handle Error exceptions', async () => {
      mockRuntimeRun.mockRejectedValue(new Error('Execution failed'));

      const result = await capability.run('Test task');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });

    it('should handle non-Error exceptions', async () => {
      mockRuntimeRun.mockRejectedValue('String error');

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
      const noModelCap = new ExecutionCapability();
      noModelCap.initialize(noModelContext);

      const result = await noModelCap.run('Test task');

      expect(result.cost).toBeUndefined();
    });
  });
});
