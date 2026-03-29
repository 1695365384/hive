/**
 * WorkflowCapability 单元测试
 *
 * 测试单 Agent 自主循环执行能力。
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
import { WorkflowCapability } from '../../../src/agents/capabilities/WorkflowCapability.js';

describe('WorkflowCapability', () => {
  let capability: WorkflowCapability;
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
   * WorkflowCapability accumulates text via onText, not from runtimeResult.text
   */
  function mockRuntimeWithText(text: string, resultOverride?: Partial<typeof defaultRuntimeResult>) {
    return async (config: any) => {
      config.onText?.(text);
      return { ...defaultRuntimeResult, ...resultOverride };
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRuntimeRun.mockImplementation(mockRuntimeWithText('Task completed successfully'));

    capability = new WorkflowCapability();
    context = createMockAgentContext({
      activeProvider: testProvider,
      providers: [testProvider],
      skills: [testSkill],
      skillMatchResult: null,
    });
    // Mock ToolRegistry for WorkflowCapability
    (context as any).runner = {
      ...context.runner,
      getToolRegistry: vi.fn(() => ({
        getToolsForAgent: vi.fn(() => []),
      })),
    };
    capability.initialize(context);
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('生命周期', () => {
    it('should initialize correctly', () => {
      expect(capability.name).toBe('workflow');
    });

    it('should have correct name', () => {
      expect(capability.name).toBe('workflow');
    });
  });

  // ============================================
  // analyzeTask() 测试
  // ============================================

  describe('analyzeTask()', () => {
    it('should identify simple question task', () => {
      const analysis = capability.analyzeTask('What is the project structure?');

      expect(analysis.type).toBe('simple');
      expect(analysis.needsExploration).toBe(false);
      expect(analysis.needsPlanning).toBe(false);
      expect(analysis.recommendedAgents).toContain('general');
    });

    it('should identify simple question with short input', () => {
      const analysis = capability.analyzeTask('How do I use this?');

      expect(analysis.type).toBe('simple');
      expect(analysis.reason).toBe('Simple question, direct response');
    });

    it('should treat longer tasks as moderate', () => {
      const analysis = capability.analyzeTask(`
        I need to implement a new feature for the authentication system.
        It should support JWT tokens and OAuth2.
        Please also add proper tests.
      `);

      expect(analysis.type).toBe('moderate');
      expect(analysis.needsExploration).toBe(true);
      expect(analysis.needsPlanning).toBe(true);
    });

    it('should treat multi-line tasks as moderate', () => {
      const analysis = capability.analyzeTask(`
        Add a new API endpoint
        Update the database schema
        Write tests
      `);

      expect(analysis.type).toBe('moderate');
      expect(analysis.needsExploration).toBe(true);
      expect(analysis.needsPlanning).toBe(true);
    });

    it('should return moderate for complex-looking single questions', () => {
      const longQuestion = 'What is the best way to refactor the entire authentication system to support multiple providers including OAuth2, SAML, and custom implementations while maintaining backward compatibility?';
      const analysis = capability.analyzeTask(longQuestion);

      expect(analysis.type).toBe('moderate');
    });

    it('should classify short greeting as simple', () => {
      const analysis = capability.analyzeTask('你好啊');
      expect(analysis.type).toBe('simple');
      expect(analysis.needsExploration).toBe(false);
      expect(analysis.needsPlanning).toBe(false);
      expect(analysis.reason).toBe('Short message, no action verbs detected');
    });

    it('should classify short thanks as simple', () => {
      const analysis = capability.analyzeTask('谢谢');
      expect(analysis.type).toBe('simple');
      expect(analysis.needsExploration).toBe(false);
    });

    it('should classify short presence check as simple', () => {
      const analysis = capability.analyzeTask('在吗');
      expect(analysis.type).toBe('simple');
      expect(analysis.needsExploration).toBe(false);
    });

    it('should classify short message with action verb as moderate', () => {
      const analysis = capability.analyzeTask('修复登录bug');
      expect(analysis.type).toBe('moderate');
      expect(analysis.needsExploration).toBe(true);
    });

    it('should classify short English action task as moderate', () => {
      const analysis = capability.analyzeTask('fix auth bug');
      expect(analysis.type).toBe('moderate');
      expect(analysis.needsExploration).toBe(true);
    });
  });

  // ============================================
  // run() 测试
  // ============================================

  describe('run()', () => {
    it('should run workflow and return result', async () => {
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

    it('should pass tools from ToolRegistry', async () => {
      await capability.run('Test task');

      const callArgs = mockRuntimeRun.mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
    });

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

    it('should invoke onTool callback during execution', async () => {
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

    it('should handle errors and return success: false', async () => {
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

    it('should include usage in result', async () => {
      const result = await capability.run('Test task');

      expect(result.usage).toBeDefined();
      expect(result.usage!.input).toBe(200);
      expect(result.usage!.output).toBe(100);
    });

    it('should include duration in result', async () => {
      const result = await capability.run('Test task');

      expect(result.duration).toBeDefined();
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================
  // preview() 测试
  // ============================================

  describe('preview()', () => {
    it('should return task analysis', async () => {
      const preview = await capability.preview('What is the project?');

      expect(preview.analysis).toBeDefined();
      expect(preview.analysis.type).toBe('simple');
    });

    it('should return intelligent prompt', async () => {
      const preview = await capability.preview('Test task');

      expect(preview.intelligentPrompt).toBeDefined();
      expect(typeof preview.intelligentPrompt).toBe('string');
      expect(preview.intelligentPrompt.length).toBeGreaterThan(0);
    });

    it('should include language instruction for Chinese', async () => {
      const preview = await capability.preview('这是什么？');

      expect(preview.intelligentPrompt).toContain('中文');
    });

    it('should include language instruction for English', async () => {
      const preview = await capability.preview('What is this?');

      expect(preview.intelligentPrompt).toContain('English');
    });

    it('should not execute runtime', async () => {
      await capability.preview('Test task');

      expect(mockRuntimeRun).not.toHaveBeenCalled();
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
  // 技能集成测试
  // ============================================

  describe('技能集成', () => {
    it('should include skill section when matched', async () => {
      const skillMatchContext = createMockAgentContext({
        activeProvider: testProvider,
        providers: [testProvider],
        skills: [testSkill],
        skillMatchResult: {
          skill: testSkill,
          matchedPhrase: 'review',
          matchIndex: 0,
        },
      });
      (skillMatchContext as any).runner = {
        ...skillMatchContext.runner,
        getToolRegistry: vi.fn(() => ({
          getToolsForAgent: vi.fn(() => []),
        })),
      };

      const skillCapability = new WorkflowCapability();
      skillCapability.initialize(skillMatchContext);

      await skillCapability.run('Review code');

      const callArgs = mockRuntimeRun.mock.calls[0][0];
      expect(callArgs.system).toContain('Active Skill');
    });

    it('should include skill list when no match but skills exist', async () => {
      const skillsContext = createMockAgentContext({
        activeProvider: testProvider,
        providers: [testProvider],
        skills: [testSkill],
        skillMatchResult: null,
      });
      (skillsContext as any).runner = {
        ...skillsContext.runner,
        getToolRegistry: vi.fn(() => ({
          getToolsForAgent: vi.fn(() => []),
        })),
      };

      const skillsCapability = new WorkflowCapability();
      skillsCapability.initialize(skillsContext);

      await skillsCapability.run('Do something');

      const callArgs = mockRuntimeRun.mock.calls[0][0];
      expect(callArgs.system).toContain('Available Skills');
      expect(callArgs.system).toContain('Code Review');
    });
  });

  // ============================================
  // Session 集成测试
  // ============================================

  describe('Session 集成', () => {
    it('should load session messages when available', async () => {
      const sessionContext = createMockAgentContext({
        activeProvider: testProvider,
        providers: [testProvider],
      });
      (sessionContext as any).runner = {
        ...sessionContext.runner,
        getToolRegistry: vi.fn(() => ({
          getToolsForAgent: vi.fn(() => []),
        })),
      };
      (sessionContext as any).getSessionCap = vi.fn(() => ({
        getMessages: vi.fn(() => [
          { role: 'user', content: 'previous message' },
          { role: 'assistant', content: 'previous response' },
        ]),
      }));

      const sessionCapability = new WorkflowCapability();
      sessionCapability.initialize(sessionContext);

      await sessionCapability.run('new task');

      const callArgs = mockRuntimeRun.mock.calls[0][0];
      // When history exists, messages should be passed instead of prompt
      expect(callArgs.messages).toBeDefined();
      expect(callArgs.messages.length).toBe(3); // 2 history + 1 new user message
      expect(callArgs.prompt).toBeUndefined();
    });

    it('should use prompt when no session history', async () => {
      await capability.run('test task');

      const callArgs = mockRuntimeRun.mock.calls[0][0];
      expect(callArgs.prompt).toBe('test task');
      expect(callArgs.messages).toBeUndefined();
    });

    it('should handle missing SessionCapability gracefully', async () => {
      // Default mock context has no getSessionCap — should not throw
      const result = await capability.run('test task');
      expect(result.success).toBe(true);
    });
  });
});
