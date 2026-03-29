/**
 * WorkflowCapability 单元测试
 *
 * 测试工作流能力
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowCapability } from '../../../src/agents/capabilities/WorkflowCapability.js';
import {
  createMockAgentContext,
  createTestProviderConfig,
  createTestSkill,
} from '../../mocks/agent-context.mock.js';
import type { AgentContext, AgentResult, TaskAnalysis } from '../../../src/agents/core/types.js';

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

  const mockAgentResult: AgentResult = {
    text: 'Task completed successfully',
    success: true,
    tools: ['Read', 'Write', 'Edit'],
    usage: { input: 200, output: 100 },
  };

  const testSkill = createTestSkill({
    metadata: {
      name: 'Code Review',
      description: 'Review code quality',
      version: '1.0.0',
      tags: ['review'],
    },
    body: '# Code Review\n\nReview code for quality.',
  });

  beforeEach(() => {
    capability = new WorkflowCapability();
    context = createMockAgentContext({
      activeProvider: testProvider,
      providers: [testProvider],
      skills: [testSkill],
      skillMatchResult: null,
    });
    vi.mocked(context.runner.execute).mockResolvedValue(mockAgentResult);
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

      // 长问题（超过100字符）被识别为 moderate
      expect(analysis.type).toBe('moderate');
    });
  });

  // ============================================
  // run() 测试
  // ============================================

  describe('run()', () => {
    it('should run workflow and return result', async () => {
      const result = await capability.run('Implement a feature');

      expect(result.success).toBe(true);
      expect(result.analysis).toBeDefined();
      expect(result.executeResult).toBeDefined();
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

      expect(phases).toContain('analyze');
      expect(phases).toContain('execute');
      expect(phases).toContain('complete');
    });

    it('should call onPhase callback', async () => {
      const phases: Array<{ phase: string; message: string }> = [];

      await capability.run('Test task', {
        onPhase: (phase, message) => phases.push({ phase, message }),
      });

      expect(phases.length).toBeGreaterThan(0);
      expect(phases.some(p => p.phase === 'analyze')).toBe(true);
      expect(phases.some(p => p.phase === 'execute')).toBe(true);
    });

    it('should call onText callback', async () => {
      const texts: string[] = [];

      await capability.run('Test task', {
        onText: (text) => texts.push(text),
      });

      // 验证 runner 被调用时传递了 onText
      expect(context.runner.execute).toHaveBeenCalledWith(
        'general',
        expect.any(String),
        expect.objectContaining({
          onText: expect.any(Function),
        })
      );
    });

    it('should invoke onTool callback during execution', async () => {
      vi.mocked(context.runner.execute).mockImplementation(
        async (_agent: string, _prompt: string, opts?: any) => {
          opts?.onTool?.('Read', { file_path: '/test.ts' });
          return mockAgentResult;
        }
      );
      const tools: Array<{ name: string; input: unknown }> = [];
      await capability.run('Test task', {
        onTool: (name, input) => tools.push({ name, input }),
      });
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0].name).toBe('Read');
    });

    it('should use cwd option', async () => {
      await capability.run('Test task', {
        cwd: '/test/workspace',
      });

      expect(context.runner.execute).toHaveBeenCalledWith(
        'general',
        expect.any(String),
        expect.objectContaining({
          cwd: '/test/workspace',
        })
      );
    });

    it('should set maxTurns to 20', async () => {
      await capability.run('Test task');

      expect(context.runner.execute).toHaveBeenCalledWith(
        'general',
        expect.any(String),
        expect.objectContaining({
          maxTurns: 20,
        })
      );
    });

    it('should handle errors and return success: false', async () => {
      vi.mocked(context.runner.execute).mockRejectedValue(new Error('Execution failed'));

      const result = await capability.run('Test task');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });

    it('should trigger error phase on failure', async () => {
      const phases: string[] = [];
      vi.mocked(context.runner.execute).mockRejectedValue(new Error('Failed'));
      vi.mocked(context.hookRegistry.emit).mockImplementation(async (type, ctx: any) => {
        if (type === 'workflow:phase') {
          phases.push(ctx.phase);
        }
        return true;
      });

      await capability.run('Test task');

      expect(phases).toContain('error');
    });

    it('should match skill and include in prompt', async () => {
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
      vi.mocked(skillMatchContext.runner.execute).mockResolvedValue(mockAgentResult);

      const skillCapability = new WorkflowCapability();
      skillCapability.initialize(skillMatchContext);

      await skillCapability.run('Review this code');

      const callArgs = vi.mocked(skillMatchContext.runner.execute).mock.calls[0];
      const prompt = callArgs[1] as string;

      expect(prompt).toContain('Code Review');
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

    it('should not execute task', async () => {
      await capability.preview('Test task');

      // preview 不应该执行 runner
      expect(context.runner.execute).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 语言检测测试
  // ============================================

  describe('语言检测', () => {
    it('should detect Chinese and add language instruction', async () => {
      await capability.run('帮我实现一个功能');

      const callArgs = vi.mocked(context.runner.execute).mock.calls[0];
      const prompt = callArgs[1] as string;

      expect(prompt).toContain('中文');
    });

    it('should detect English and add language instruction', async () => {
      await capability.run('Implement a feature');

      const callArgs = vi.mocked(context.runner.execute).mock.calls[0];
      const prompt = callArgs[1] as string;

      expect(prompt).toContain('English');
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
      vi.mocked(skillMatchContext.runner.execute).mockResolvedValue(mockAgentResult);

      const skillCapability = new WorkflowCapability();
      skillCapability.initialize(skillMatchContext);

      await skillCapability.run('Review code');

      const callArgs = vi.mocked(skillMatchContext.runner.execute).mock.calls[0];
      const prompt = callArgs[1] as string;

      expect(prompt).toContain('Active Skill');
    });

    it('should include skill list when no match but skills exist', async () => {
      const skillsContext = createMockAgentContext({
        activeProvider: testProvider,
        providers: [testProvider],
        skills: [testSkill],
        skillMatchResult: null, // 无匹配
      });
      vi.mocked(skillsContext.runner.execute).mockResolvedValue(mockAgentResult);
      // createMockAgentContext 中的 generateSkillListDescription 会根据 skills 自动生成描述

      const skillsCapability = new WorkflowCapability();
      skillsCapability.initialize(skillsContext);

      await skillsCapability.run('Do something');

      const callArgs = vi.mocked(skillsContext.runner.execute).mock.calls[0];
      const prompt = callArgs[1] as string;

      // 验证 prompt 包含技能列表（由 mock 自动生成）
      expect(prompt).toContain('Available Skills');
      expect(prompt).toContain('Code Review');
    });
  });

  // ============================================
  // 错误处理测试
  // ============================================

  describe('错误处理', () => {
    it('should handle non-Error exceptions', async () => {
      vi.mocked(context.runner.execute).mockRejectedValue('String error');

      const result = await capability.run('Test task');

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });

    it('should include error in workflow result', async () => {
      vi.mocked(context.runner.execute).mockRejectedValue(new Error('Task failed'));

      const result = await capability.run('Test task');

      expect(result.error).toBe('Task failed');
    });
  });

  // ============================================
  // 三阶段执行测试 (explore → plan → execute)
  // ============================================

  describe('三阶段执行 (explore → plan → execute)', () => {
    it('should run explore → plan → execute for moderate tasks when SubAgent available', async () => {
      const mockExplore = vi.fn(async () => 'Found relevant files in src/');
      const mockPlan = vi.fn(async () => 'Step 1: Modify X, Step 2: Add Y');
      const mockSubAgentCap = {
        name: 'subAgent',
        explore: mockExplore,
        plan: mockPlan,
        initialize: vi.fn(),
      };

      vi.mocked(context.getCapability).mockImplementation((name: string) => {
        if (name === 'subAgent') return mockSubAgentCap;
        if (name === 'timeout') return context.timeoutCap;
        return undefined;
      });

      const moderateTask = 'I need to implement a new feature for the authentication system. It should support JWT tokens and OAuth2.';

      const result = await capability.run(moderateTask);

      expect(result.analysis.type).toBe('moderate');
      expect(mockExplore).toHaveBeenCalledWith(moderateTask);
      expect(mockPlan).toHaveBeenCalledWith(expect.stringContaining(moderateTask));
      expect(result.exploreResult).toBeDefined();
      expect(result.exploreResult!.text).toBe('Found relevant files in src/');
      expect(result.exploreResult!.success).toBe(true);
      expect(result.executionPlan).toBe('Step 1: Modify X, Step 2: Add Y');
      expect(result.executeResult).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should include explore and plan context in execute prompt', async () => {
      const mockSubAgentCap = {
        name: 'subAgent',
        explore: vi.fn(async () => 'Found 3 files'),
        plan: vi.fn(async () => 'Plan: do X then Y'),
        initialize: vi.fn(),
      };

      vi.mocked(context.getCapability).mockImplementation((name: string) => {
        if (name === 'subAgent') return mockSubAgentCap;
        if (name === 'timeout') return context.timeoutCap;
        return undefined;
      });

      vi.mocked(context.runner.execute).mockClear();
      vi.mocked(context.runner.execute).mockResolvedValue(mockAgentResult);

      await capability.run('Implement a feature');

      const calls = vi.mocked(context.runner.execute).mock.calls;
      expect(calls.length).toBe(1);

      const prompt = calls[0][1] as string;
      expect(prompt).toContain('Found 3 files');
      expect(prompt).toContain('Plan: do X then Y');
      expect(prompt).toContain('探索发现');
      expect(prompt).toContain('执行计划');
    });

    it('should degrade to direct execution when SubAgent not available', async () => {
      // getCapability returns undefined for 'subAgent'
      vi.mocked(context.getCapability).mockImplementation((name: string) => {
        if (name === 'timeout') return context.timeoutCap;
        return undefined;
      });

      const result = await capability.run('Implement a feature');

      expect(result.success).toBe(true);
      expect(result.executeResult).toBeDefined();
      expect(result.exploreResult).toBeUndefined();
      expect(result.executionPlan).toBeUndefined();
    });

    it('should handle explore phase failure gracefully', async () => {
      const mockSubAgentCap = {
        name: 'subAgent',
        explore: vi.fn(async () => { throw new Error('Explore failed'); }),
        plan: vi.fn(async () => 'Fallback plan'),
        initialize: vi.fn(),
      };

      vi.mocked(context.getCapability).mockImplementation((name: string) => {
        if (name === 'subAgent') return mockSubAgentCap;
        if (name === 'timeout') return context.timeoutCap;
        return undefined;
      });

      const result = await capability.run('Implement a feature');

      // Should continue with plan and execute even if explore fails
      expect(result.exploreResult).toBeDefined();
      expect(result.exploreResult!.success).toBe(false);
      expect(result.exploreResult!.text).toContain('探索失败');
      expect(mockSubAgentCap.plan).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should handle plan phase failure gracefully', async () => {
      const mockSubAgentCap = {
        name: 'subAgent',
        explore: vi.fn(async () => 'Found files'),
        plan: vi.fn(async () => { throw new Error('Plan failed'); }),
        initialize: vi.fn(),
      };

      vi.mocked(context.getCapability).mockImplementation((name: string) => {
        if (name === 'subAgent') return mockSubAgentCap;
        if (name === 'timeout') return context.timeoutCap;
        return undefined;
      });

      const result = await capability.run('Implement a feature');

      // Should continue to execute even if plan fails
      expect(result.exploreResult!.success).toBe(true);
      expect(result.executionPlan).toContain('规划失败');
      expect(result.executeResult).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should emit explore and plan phases', async () => {
      const phases: string[] = [];
      vi.mocked(context.hookRegistry.emit).mockImplementation(async (type, ctx: any) => {
        if (type === 'workflow:phase') {
          phases.push(ctx.phase);
        }
        return true;
      });

      const mockSubAgentCap = {
        name: 'subAgent',
        explore: vi.fn(async () => 'Explored'),
        plan: vi.fn(async () => 'Planned'),
        initialize: vi.fn(),
      };

      vi.mocked(context.getCapability).mockImplementation((name: string) => {
        if (name === 'subAgent') return mockSubAgentCap;
        if (name === 'timeout') return context.timeoutCap;
        return undefined;
      });

      await capability.run('Implement a feature');

      expect(phases).toContain('analyze');
      expect(phases).toContain('explore');
      expect(phases).toContain('plan');
      expect(phases).toContain('execute');
      expect(phases).toContain('complete');
    });

    it('should skip explore and plan for simple tasks', async () => {
      const mockSubAgentCap = {
        name: 'subAgent',
        explore: vi.fn(async () => 'Should not be called'),
        plan: vi.fn(async () => 'Should not be called'),
        initialize: vi.fn(),
      };

      vi.mocked(context.getCapability).mockImplementation((name: string) => {
        if (name === 'subAgent') return mockSubAgentCap;
        if (name === 'timeout') return context.timeoutCap;
        return undefined;
      });

      await capability.run('What is TypeScript?');

      expect(mockSubAgentCap.explore).not.toHaveBeenCalled();
      expect(mockSubAgentCap.plan).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 自动压缩测试
  // ============================================

  describe('自动压缩', () => {
    it('should call compressIfNeeded after explore and plan phases', async () => {
      const mockCompressIfNeeded = vi.fn();
      const mockSubAgentCap = {
        name: 'subAgent',
        explore: vi.fn(async () => 'Found files'),
        plan: vi.fn(async () => 'Plan details'),
        initialize: vi.fn(),
      };

      // Set up context with SessionCapability
      (context as any).getSessionCap = vi.fn(() => ({
        compressIfNeeded: mockCompressIfNeeded,
      }));

      vi.mocked(context.getCapability).mockImplementation((name: string) => {
        if (name === 'subAgent') return mockSubAgentCap;
        if (name === 'timeout') return context.timeoutCap;
        return undefined;
      });

      await capability.run('Implement a feature');

      // compressIfNeeded should be called twice: after explore and after plan
      expect(mockCompressIfNeeded).toHaveBeenCalledTimes(2);
    });

    it('should not throw when SessionCapability is not available', async () => {
      const mockSubAgentCap = {
        name: 'subAgent',
        explore: vi.fn(async () => 'Found files'),
        plan: vi.fn(async () => 'Plan details'),
        initialize: vi.fn(),
      };

      // getSessionCap returns null
      (context as any).getSessionCap = vi.fn(() => null);

      vi.mocked(context.getCapability).mockImplementation((name: string) => {
        if (name === 'subAgent') return mockSubAgentCap;
        if (name === 'timeout') return context.timeoutCap;
        return undefined;
      });

      // Should not throw
      const result = await capability.run('Implement a feature');
      expect(result.success).toBe(true);
    });

    it('should not throw when getSessionCap is undefined', async () => {
      const mockSubAgentCap = {
        name: 'subAgent',
        explore: vi.fn(async () => 'Found files'),
        plan: vi.fn(async () => 'Plan details'),
        initialize: vi.fn(),
      };

      // getSessionCap is not defined at all
      delete (context as any).getSessionCap;

      vi.mocked(context.getCapability).mockImplementation((name: string) => {
        if (name === 'subAgent') return mockSubAgentCap;
        if (name === 'timeout') return context.timeoutCap;
        return undefined;
      });

      const result = await capability.run('Implement a feature');
      expect(result.success).toBe(true);
    });

    it('should not block workflow when compression throws', async () => {
      const mockSubAgentCap = {
        name: 'subAgent',
        explore: vi.fn(async () => 'Found files'),
        plan: vi.fn(async () => 'Plan details'),
        initialize: vi.fn(),
      };

      (context as any).getSessionCap = vi.fn(() => ({
        compressIfNeeded: vi.fn().mockRejectedValue(new Error('Compression failed')),
      }));

      vi.mocked(context.getCapability).mockImplementation((name: string) => {
        if (name === 'subAgent') return mockSubAgentCap;
        if (name === 'timeout') return context.timeoutCap;
        return undefined;
      });

      // Should not throw even if compression fails
      const result = await capability.run('Implement a feature');
      expect(result.success).toBe(true);
    });

    it('should not compress for simple tasks', async () => {
      const mockCompressIfNeeded = vi.fn();

      (context as any).getSessionCap = vi.fn(() => ({
        compressIfNeeded: mockCompressIfNeeded,
      }));

      // Simple task - no subAgent needed
      await capability.run('What is TypeScript?');

      // compressIfNeeded should NOT be called for simple tasks
      expect(mockCompressIfNeeded).not.toHaveBeenCalled();
    });
  });
});
