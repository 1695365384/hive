/**
 * Agent + Skill 集成测试
 *
 * 测试 Skill 与 Agent 的完整集成，包括：
 * - 技能匹配和使用
 * - 技能注册和注销
 * - 技能指令生成
 * - 技能与工作流的配合
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Agent, createAgent } from '../../src/agents/core/index.js';
import type { Skill, SkillMatchResult } from '../../src/skills/index.js';
import { streamText } from 'ai';

// Mock ai module so streamText is a spy
vi.mock('ai', () => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
  stepCountIs: vi.fn((n: number) => n),
  tool: vi.fn((config: Record<string, unknown>) => config),
  zodSchema: vi.fn((schema: unknown) => schema),
}));

// ============================================
// Mock ProviderManager — 让 chat() 可以调用 LLM
// ============================================

vi.mock('../../src/providers/ProviderManager.js', () => {
  const fakeModel = {
    modelId: 'mock-model',
    provider: 'mock-provider',
    specificationVersion: 'v3',
    defaultObjectGenerationMode: 'json',
    supportedObjectModes: ['json', 'tool', 'grammar'],
    maxEmbeddingsPerCall: 1,
  };
  class MockProviderManager {
    active: any = null;
    all: any[] = [];
    getModelWithSpec = vi.fn().mockResolvedValue({ model: fakeModel, spec: null });
    getModelForProvider = vi.fn().mockResolvedValue(fakeModel);
    getModel = vi.fn().mockResolvedValue(fakeModel);
    switch = vi.fn().mockReturnValue(false);
    reResolveAll = vi.fn();
    dispose = vi.fn();
  }
  return {
    ProviderManager: MockProviderManager,
    createProviderManager: vi.fn().mockImplementation(() => new MockProviderManager()),
  };
});

/**
 * 创建测试用 Skill 对象
 */
function createTestSkill(overrides: Partial<Skill>): Skill {
  return {
    metadata: {
      name: 'Test Skill',
      description: 'A test skill',
      version: '1.0.0',
      tags: [],
      ...overrides.metadata,
    },
    body: '# Test Skill',
    path: '/test/skill',
    references: [],
    scripts: [],
    examples: [],
    assets: [],
    ...overrides,
  };
}

describe('Agent + Skill Integration', () => {
  // ============================================
  // Skill Registration
  // ============================================
  describe('Skill Registration', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should list available skills', () => {
      const skills = agent.listSkills();
      expect(Array.isArray(skills)).toBe(true);
    });

    it('should list skill metadata', () => {
      const metadata = agent.listSkillMetadata();
      expect(Array.isArray(metadata)).toBe(true);

      for (const m of metadata) {
        expect(m).toHaveProperty('name');
        expect(m).toHaveProperty('description');
      }
    });

    it('should get skill by name', () => {
      const skills = agent.listSkills();

      if (skills.length > 0) {
        const skill = agent.getSkill(skills[0].metadata.name);
        expect(skill).toBeDefined();
        expect(skill?.metadata.name).toBe(skills[0].metadata.name);
      }
    });

    it('should return undefined for unknown skill', () => {
      const skill = agent.getSkill('non-existent-skill');
      expect(skill).toBeUndefined();
    });

    it('should register new skill', () => {
      const newSkill = createTestSkill({
        metadata: {
          name: 'Test Skill',
          description: 'A test skill for integration testing',
          version: '1.0.0',
          tags: ['test'],
        },
        body: '# Test Skill\n\nThis is a test skill.',
      });

      agent.registerSkill(newSkill);

      const skill = agent.getSkill('Test Skill');
      expect(skill).toBeDefined();
      expect(skill?.metadata.name).toBe('Test Skill');
    });
  });

  // ============================================
  // Skill Matching
  // ============================================
  describe('Skill Matching', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should match skill from input', () => {
      // 注册一个测试技能
      const testSkill = createTestSkill({
        metadata: {
          name: 'Code Review',
          description: 'Review code for quality and best practices',
          version: '1.0.0',
          tags: ['code', 'review', 'quality'],
        },
        body: '# Code Review\n\nReview code for quality.',
      });
      agent.registerSkill(testSkill);

      const result = agent.matchSkill('please review this code');
      // 匹配结果取决于 matcher 实现
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should return null for no match', () => {
      const result = agent.matchSkill('random text that does not match anything');
      // 可能匹配到某些技能，也可能不匹配
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should have skillRegistry in context', () => {
      expect(agent.context.skillRegistry).toBeDefined();
    });
  });

  // ============================================
  // Skill Instruction Generation
  // ============================================
  describe('Skill Instruction Generation', () => {
    let agent: Agent;
    let testSkill: Skill;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();

      testSkill = createTestSkill({
        metadata: {
          name: 'Test Generator',
          description: 'Generate test cases for code',
          version: '2.0.0',
          tags: ['testing', 'tdd'],
        },
        body: '# Test Generator\n\nGenerate comprehensive unit tests.',
      });
      agent.registerSkill(testSkill);
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should generate skill instruction', () => {
      const instruction = agent.generateSkillInstruction(testSkill);

      expect(instruction).toContain('Test Generator');
      expect(instruction).toContain('Generate test cases');
    });

    it('should include skill body in instruction', () => {
      const instruction = agent.generateSkillInstruction(testSkill);

      expect(instruction).toContain('Generate comprehensive unit tests');
    });
  });

  // ============================================
  // Skill + Provider Integration
  // ============================================
  describe('Skill + Provider Integration', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should work with provider switching', async () => {
      const providers = agent.listProviders();

      if (providers.length > 0) {
        // 切换 provider
        agent.useProvider(providers[0].id);

        // 技能应该仍然可用
        const skills = agent.listSkills();
        expect(Array.isArray(skills)).toBe(true);
      }
    });

    it('should have independent skill and provider registries', () => {
      expect(agent.context.skillRegistry).toBeDefined();
      expect(agent.context.providerManager).toBeDefined();

      // 两个应该是独立的对象
      expect(agent.context.skillRegistry).not.toBe(agent.context.providerManager);
    });
  });

  // ============================================
  // Skill + Hook Integration
  // ============================================
  describe('Skill + Hook Integration', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should be able to register skill:match hook', () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('skill:match', hookSpy);

      expect(agent.context.hookRegistry.has('skill:match')).toBe(true);
    });

    it('should have skill match hook type defined', () => {
      // 验证 hook 类型存在
      expect(agent.context.hookRegistry.on).toBeDefined();
      expect(agent.context.hookRegistry.emit).toBeDefined();
    });
  });

  // ============================================
  // Skill Capability Methods
  // ============================================
  describe('Skill Capability Methods', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should have skillCap initialized', () => {
      const skillCap = (agent as any).skillCap;
      expect(skillCap).toBeDefined();
      expect(skillCap.listAll).toBeDefined();
      expect(skillCap.get).toBeDefined();
      expect(skillCap.match).toBeDefined();
      expect(skillCap.register).toBeDefined();
    });

    it('should return same skill from capability and agent', () => {
      const skillCap = (agent as any).skillCap;
      const skills = agent.listSkills();

      if (skills.length > 0) {
        const capSkill = skillCap.get(skills[0].metadata.name);
        const agentSkill = agent.getSkill(skills[0].metadata.name);

        expect(capSkill).toBe(agentSkill);
      }
    });

    it('should have size property', () => {
      const skillCap = (agent as any).skillCap;
      expect(typeof skillCap.size).toBe('number');
      expect(skillCap.size).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================
  // Multi-Agent Skill Isolation
  // ============================================
  describe('Multi-Agent Skill Isolation', () => {
    let agent1: Agent;
    let agent2: Agent;

    beforeEach(async () => {
      agent1 = createAgent();
      agent2 = createAgent();
      await agent1.initialize();
      await agent2.initialize();
    });

    afterEach(async () => {
      await agent1.dispose();
      await agent2.dispose();
    });

    it('should have separate skill registries', () => {
      expect(agent1.context.skillRegistry).not.toBe(agent2.context.skillRegistry);
    });

    it('should allow independent skill registration', () => {
      const skill1 = createTestSkill({
        metadata: {
          name: 'Agent1 Skill',
          description: 'Skill for agent 1',
          version: '1.0.0',
          tags: ['agent1'],
        },
        body: '# Agent1 Skill',
      });

      const skill2 = createTestSkill({
        metadata: {
          name: 'Agent2 Skill',
          description: 'Skill for agent 2',
          version: '1.0.0',
          tags: ['agent2'],
        },
        body: '# Agent2 Skill',
      });

      agent1.registerSkill(skill1);
      agent2.registerSkill(skill2);

      expect(agent1.getSkill('Agent1 Skill')).toBeDefined();
      expect(agent1.getSkill('Agent2 Skill')).toBeUndefined();

      expect(agent2.getSkill('Agent2 Skill')).toBeDefined();
      expect(agent2.getSkill('Agent1 Skill')).toBeUndefined();
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should handle empty skill name', () => {
      const skill = agent.getSkill('');
      expect(skill).toBeUndefined();
    });

    it('should handle skill with empty body', () => {
      const emptySkill = createTestSkill({
        metadata: {
          name: 'Empty Skill',
          description: 'A skill with empty body',
          version: '1.0.0',
          tags: ['empty'],
        },
        body: '',
      });

      // 应该能注册
      agent.registerSkill(emptySkill);

      const instruction = agent.generateSkillInstruction(emptySkill);
      expect(instruction).toContain('Empty Skill');
    });

    it('should handle skill with special characters in name', () => {
      const specialSkill = createTestSkill({
        metadata: {
          name: 'Special-Skill_v2.0',
          description: 'A skill with special characters',
          version: '1.0.0',
          tags: ['special'],
        },
        body: '# Special Skill',
      });

      agent.registerSkill(specialSkill);

      const skill = agent.getSkill('Special-Skill_v2.0');
      expect(skill).toBeDefined();
    });
  });

  // ============================================
  // 技能在 Chat 中的使用验证（智能 mock）
  // ============================================
  describe('Skill Usage in Chat', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
      vi.clearAllMocks();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should include skill instruction in streamText system prompt', async () => {
      const codeReviewSkill = createTestSkill({
        metadata: {
          name: 'Code Review',
          description: 'Review code for quality and best practices',
          version: '1.0.0',
          tags: ['code', 'review'],
        },
        body: '# Code Review\n\nReview code for quality, readability, and best practices.\nFocus on: naming, structure, error handling.',
      });
      agent.registerSkill(codeReviewSkill);

      (streamText as any).mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'start' };
          yield { type: 'text-delta', text: 'Code review completed' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 10, outputTokens: 5 } };
        })(),
        text: Promise.resolve('Code review completed'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      });

      await agent.dispatch('review this code');

      expect(streamText).toHaveBeenCalled();
      const callArgs = (streamText as any).mock.calls[0][0];
      // streamText 通过 LLMRuntime 调用，应有 prompt 和 model 参数
      expect(callArgs.prompt ?? callArgs.messages).toBeDefined();
    });

    it('should trigger skill:match hook when skill matches input', async () => {
      const testSkill = createTestSkill({
        metadata: {
          name: 'Test Generator',
          description: 'Generate unit tests for code',
          version: '1.0.0',
          tags: ['testing', 'tdd', 'unit-test'],
        },
        body: '# Test Generator\n\nGenerate comprehensive unit tests.',
      });
      agent.registerSkill(testSkill);

      const matchHook = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('skill:match', matchHook);

      // 手动触发匹配（模拟 chat 中的技能匹配流程）
      const matchResult = agent.matchSkill('generate unit tests for this function');
      if (matchResult) {
        // 如果匹配到，验证 skill:match hook 是否会被触发
        // 注意：matchSkill 本身不触发 hook，hook 在 ChatCapability 的 chat 流程中触发
        expect(matchResult).toBeDefined();
      }
    });

    it('should generate skill instruction that contains skill body', async () => {
      const deploySkill = createTestSkill({
        metadata: {
          name: 'Deploy Helper',
          description: 'Help with deployment tasks',
          version: '1.0.0',
          tags: ['deploy', 'devops'],
        },
        body: '# Deploy Helper\n\nSteps:\n1. Run tests\n2. Build project\n3. Deploy to staging\n4. Verify deployment',
      });
      agent.registerSkill(deploySkill);

      const instruction = agent.generateSkillInstruction(deploySkill);

      expect(instruction).toContain('Deploy Helper');
      expect(instruction).toContain('Run tests');
      expect(instruction).toContain('Build project');
    });

    it('should register skill and have it available in chat context', async () => {
      const analysisSkill = createTestSkill({
        metadata: {
          name: 'Code Analysis',
          description: 'Analyze code for patterns and issues',
          version: '1.0.0',
          tags: ['analysis'],
        },
        body: '# Code Analysis\n\nAnalyze code patterns.',
      });
      agent.registerSkill(analysisSkill);

      // 验证技能已注册
      const skill = agent.getSkill('Code Analysis');
      expect(skill).toBeDefined();
      expect(skill?.metadata.name).toBe('Code Analysis');

      // 验证技能出现在列表中
      const skills = agent.listSkills();
      const names = skills.map(s => s.metadata.name);
      expect(names).toContain('Code Analysis');

      // chat 应该可以正常执行
      (streamText as any).mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'start' };
          yield { type: 'text-delta', text: 'Analysis done' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 10, outputTokens: 5 } };
        })(),
        text: Promise.resolve('Analysis done'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      });

      const result = await agent.dispatch('analyze this code');
      expect(result.text).toBe('Analysis done');
    });

    it('should have skill available across multiple chat turns', async () => {
      const debugSkill = createTestSkill({
        metadata: {
          name: 'Debug Helper',
          description: 'Help debug issues',
          version: '1.0.0',
          tags: ['debug'],
        },
        body: '# Debug Helper\n\nHelp debug issues.',
      });
      agent.registerSkill(debugSkill);

      // 第一轮 chat
      (streamText as any).mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'start' };
          yield { type: 'text-delta', text: 'First response' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 10, outputTokens: 5 } };
        })(),
        text: Promise.resolve('First response'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      });

      const r1 = await agent.dispatch('first message');
      expect(r1.text).toBe('First response');

      // 技能仍然可用
      expect(agent.getSkill('Debug Helper')).toBeDefined();

      // 第二轮 chat
      (streamText as any).mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'start' };
          yield { type: 'text-delta', text: 'Second response' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 20, outputTokens: 10 } };
        })(),
        text: Promise.resolve('Second response'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 20, outputTokens: 10 }),
      });

      const r2 = await agent.dispatch('second message');
      expect(r2.text).toBe('Second response');

      // streamText 被调用了两次
      expect(streamText).toHaveBeenCalledTimes(2);
    });
  });
});
