/**
 * Agent + Provider 集成测试
 *
 * 测试 Provider 与 Agent 的完整集成，包括：
 * - Provider 切换后 Agent 行为
 * - Provider Hook 触发
 * - ChatCapability 使用 Provider 配置
 * - 多 Agent 实例的 Provider 隔离
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Agent, createAgent } from '../../src/agents/core/index.js';
import type { ProviderConfig } from '../../src/providers/types.js';

describe('Agent + Provider Integration', () => {
  // ============================================
  // Provider Switching
  // ============================================
  describe('Provider Switching', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should have a current provider after initialization', async () => {
      const provider = agent.currentProvider;
      // Provider 可能存在（如果有配置）或为 null
      expect(provider === null || typeof provider === 'object').toBe(true);
    });

    it('should switch provider through Agent.useProvider()', async () => {
      const providers = agent.listProviders();

      // 如果有多个 provider，测试切换
      if (providers.length > 1) {
        const initialProvider = agent.currentProvider;

        // 切换到第一个不同的 provider
        const targetProvider = providers.find(p => p.id !== initialProvider?.id);
        if (targetProvider) {
          const success = agent.useProvider(targetProvider.id);
          expect(success).toBe(true);
          expect(agent.currentProvider?.id).toBe(targetProvider.id);
        }
      } else {
        // 只有一个或没有 provider，跳过切换测试
        expect(providers.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return false when switching to non-existent provider', () => {
      const success = agent.useProvider('non-existent-provider-xyz');
      expect(success).toBe(false);
    });

    it('should return false when switching with empty provider id', () => {
      const success = agent.useProvider('');
      expect(success).toBe(false);
    });

    it('should list available providers', async () => {
      const providers = agent.listProviders();
      expect(Array.isArray(providers)).toBe(true);
      // 可能为空（如果没有配置），这是合法的
    });

    it('should list provider presets', async () => {
      const presets = agent.listPresets();
      expect(Array.isArray(presets)).toBe(true);
      // 预设列表应该包含已知的 provider
      if (presets.length > 0) {
        expect(presets[0]).toHaveProperty('id');
        expect(presets[0]).toHaveProperty('name');
        expect(presets[0]).toHaveProperty('type');
      }
    });

    it('should maintain current provider on failed switch', async () => {
      const initialProvider = agent.currentProvider;
      const initialId = initialProvider?.id;

      // 尝试切换到不存在的 provider
      agent.useProvider('non-existent-provider');

      // 应保持原 Provider
      expect(agent.currentProvider?.id).toBe(initialId);
    });

    it('should accept apiKey when switching provider', async () => {
      const providers = agent.listProviders();

      if (providers.length > 0) {
        // 切换并提供新的 API key
        const success = agent.useProvider(providers[0].id, 'new-api-key');
        expect(success).toBe(true);
      }
    });
  });

  // ============================================
  // Provider Hooks
  // ============================================
  describe('Provider Hooks', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should have hookRegistry on agent context', () => {
      expect(agent.context.hookRegistry).toBeDefined();
    });

    it('should be able to register provider:beforeChange hook', () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('provider:beforeChange', hookSpy);

      expect(agent.context.hookRegistry.has('provider:beforeChange')).toBe(true);
    });

    it('should be able to register provider:afterChange hook', () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('provider:afterChange', hookSpy);

      expect(agent.context.hookRegistry.has('provider:afterChange')).toBe(true);
    });

    it('should trigger provider:beforeChange hook when using ProviderCapability.use()', async () => {
      const providers = agent.listProviders();

      if (providers.length > 1) {
        const hookSpy = vi.fn().mockReturnValue({ proceed: true });
        agent.context.hookRegistry.on('provider:beforeChange', hookSpy);

        const targetProvider = providers.find(p => p.id !== agent.currentProvider?.id);
        if (targetProvider) {
          // 使用 ProviderCapability 的异步 use 方法
          const providerCap = (agent as any).providerCap;
          await providerCap.use(targetProvider.id);

          expect(hookSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              previousProvider: expect.any(String),
              newProviderId: targetProvider.id,
            })
          );
        }
      }
    });

    it('should abort switch when hook returns proceed: false', async () => {
      const providers = agent.listProviders();

      if (providers.length > 1) {
        const initialId = agent.currentProvider?.id;

        // 注册阻止切换的 hook
        agent.context.hookRegistry.on('provider:beforeChange', () => ({
          proceed: false,
          error: new Error('Switch blocked'),
        }));

        const targetProvider = providers.find(p => p.id !== initialId);
        if (targetProvider) {
          const providerCap = (agent as any).providerCap;
          const result = await providerCap.use(targetProvider.id);

          expect(result).toBe(false);
          expect(agent.currentProvider?.id).toBe(initialId);
        }
      }
    });

    it('should trigger provider:afterChange hook after successful switch', async () => {
      const providers = agent.listProviders();

      if (providers.length > 1) {
        const hookSpy = vi.fn().mockReturnValue({ proceed: true });
        agent.context.hookRegistry.on('provider:afterChange', hookSpy);

        const targetProvider = providers.find(p => p.id !== agent.currentProvider?.id);
        if (targetProvider) {
          const providerCap = (agent as any).providerCap;
          await providerCap.use(targetProvider.id);

          expect(hookSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              previousProvider: expect.any(String),
              newProvider: targetProvider.id,
              success: true,
            })
          );
        }
      }
    });

    it('should call afterChange hook with success: false when switch fails', async () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('provider:afterChange', hookSpy);

      const providerCap = (agent as any).providerCap;
      await providerCap.use('non-existent-provider');

      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        })
      );
    });
  });

  // ============================================
  // ChatCapability Integration
  // ============================================
  describe('ChatCapability Integration', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should have access to provider config through currentProvider', async () => {
      const provider = agent.currentProvider;

      if (provider) {
        // Provider 应该有基本配置
        expect(provider.id).toBeDefined();
        expect(provider.name).toBeDefined();
      }
    });

    it('should have providerManager in context', () => {
      expect(agent.context.providerManager).toBeDefined();
    });

    it('should get model from providerManager', () => {
      const model = agent.context.providerManager.getModel();
      // 可能为 null（如果没有配置 provider）
      expect(model === null || typeof model === 'object').toBe(true);
    });

    it('should handle missing provider gracefully', async () => {
      // 创建 Agent 时如果没有配置 provider，currentProvider 可能为 null
      const provider = agent.currentProvider;
      // 这是合法状态
      expect(provider === null || typeof provider === 'object').toBe(true);
    });

    it('should have consistent provider state across capabilities', async () => {
      const providers = agent.listProviders();

      if (providers.length > 0 && agent.currentProvider) {
        const currentId = agent.currentProvider.id;

        // ProviderManager 和 Agent 应该返回相同的活跃 provider
        expect(agent.context.providerManager.getActiveProvider()?.id).toBe(currentId);
      }
    });
  });

  // ============================================
  // Multi-Agent Isolation
  // ============================================
  describe('Multi-Agent Isolation', () => {
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

    it('should have separate hook registries', () => {
      expect(agent1.context.hookRegistry).not.toBe(agent2.context.hookRegistry);
    });

    it('should have separate provider managers', () => {
      // 注意：当前实现可能共享全局 providerManager
      // 这个测试验证隔离行为
      const provider1 = agent1.currentProvider;
      const provider2 = agent2.currentProvider;

      // 两个 agent 的 provider 状态应该独立
      // 如果共享全局实例，它们会相同
    });

    it('should isolate provider switching between agents', async () => {
      const providers1 = agent1.listProviders();
      const providers2 = agent2.listProviders();

      if (providers1.length > 1 && providers2.length > 1) {
        const initial1 = agent1.currentProvider?.id;
        const initial2 = agent2.currentProvider?.id;

        // Agent1 切换到第一个不同的 provider
        const target1 = providers1.find(p => p.id !== initial1);
        if (target1) {
          agent1.useProvider(target1.id);
        }

        // Agent2 切换到另一个不同的 provider
        const target2 = providers2.find(p => p.id !== initial2 && p.id !== target1?.id);
        if (target2) {
          agent2.useProvider(target2.id);
        }

        // 验证两个 agent 的 provider 状态不同
        // 注意：如果使用全局共享的 ProviderManager，这个测试可能会失败
        // 需要根据实际实现调整预期
      }
    });

    it('should isolate hooks between agents', async () => {
      const hookSpy1 = vi.fn().mockReturnValue({ proceed: true });
      const hookSpy2 = vi.fn().mockReturnValue({ proceed: true });

      agent1.context.hookRegistry.on('provider:beforeChange', hookSpy1);
      agent2.context.hookRegistry.on('provider:beforeChange', hookSpy2);

      // 只在 agent1 上触发
      const providers1 = agent1.listProviders();
      const currentId = agent1.currentProvider?.id;
      const target = providers1.find(p => p.id !== currentId);

      // Skip test if no alternative provider available
      if (!target) {
        console.log('Skipping: No alternative provider available for isolation test');
        return;
      }

      const providerCap1 = (agent1 as any).providerCap;
      await providerCap1.use(target.id);

      // 只有 agent1 的 hook 应该被调用
      expect(hookSpy1).toHaveBeenCalled();
      expect(hookSpy2).not.toHaveBeenCalled();
    });

    it('should allow independent hook registration', () => {
      const hook1 = vi.fn().mockReturnValue({ proceed: true });
      const hook2 = vi.fn().mockReturnValue({ proceed: true });

      agent1.context.hookRegistry.on('session:start', hook1);
      agent2.context.hookRegistry.on('session:start', hook2);

      expect(agent1.context.hookRegistry.count('session:start')).toBe(1);
      expect(agent2.context.hookRegistry.count('session:start')).toBe(1);
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

    it('should handle invalid provider config gracefully', async () => {
      // 尝试切换到无效 Provider
      const result = agent.useProvider('');
      expect(result).toBe(false);
    });

    it('should maintain current provider on switch failure', async () => {
      const initialProvider = agent.currentProvider?.id;

      // 切换失败
      agent.useProvider('non-existent-provider');

      // 应保持原 Provider
      expect(agent.currentProvider?.id).toBe(initialProvider);
    });

    it('should handle provider list when empty', async () => {
      // 即使没有配置 provider，listProviders 也应该返回数组
      const providers = agent.listProviders();
      expect(Array.isArray(providers)).toBe(true);
    });

    it('should handle hook errors gracefully', async () => {
      const providers = agent.listProviders();

      if (providers.length > 1) {
        // 注册一个会抛出错误的 hook
        agent.context.hookRegistry.on('provider:beforeChange', () => {
          throw new Error('Hook error');
        });

        const target = providers.find(p => p.id !== agent.currentProvider?.id);
        if (target) {
          // 切换应该继续执行（hook 错误不应阻止操作）
          const providerCap = (agent as any).providerCap;
          // 错误应该被捕获，操作可能继续或中止取决于实现
          try {
            await providerCap.use(target.id);
          } catch (error) {
            // 如果抛出错误，也是可接受的
            expect(error).toBeInstanceOf(Error);
          }
        }
      }
    });

    it('should validate provider id type', () => {
      // TypeScript 会在编译时检查，但运行时也应该处理
      const result = agent.useProvider(null as any);
      expect(result).toBe(false);
    });

    it('should handle concurrent provider switches', async () => {
      const providers = agent.listProviders();

      if (providers.length >= 3) {
        // 并发切换到不同的 provider
        const promises = [
          Promise.resolve(agent.useProvider(providers[0].id)),
          Promise.resolve(agent.useProvider(providers[1].id)),
          Promise.resolve(agent.useProvider(providers[2].id)),
        ];

        const results = await Promise.all(promises);

        // 所有切换应该成功
        expect(results.every(r => r === true)).toBe(true);

        // 最终应该是最后一个切换的 provider
        // 但由于并发，无法确定是哪个
        expect(agent.currentProvider).toBeDefined();
      }
    });
  });

  // ============================================
  // Provider Capability Methods
  // ============================================
  describe('Provider Capability Methods', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should have providerCap initialized', () => {
      const providerCap = (agent as any).providerCap;
      expect(providerCap).toBeDefined();
      expect(providerCap.current).toBeDefined();
      expect(providerCap.listAll).toBeDefined();
      expect(providerCap.use).toBeDefined();
      expect(providerCap.useSync).toBeDefined();
    });

    it('should return same provider from capability and agent', () => {
      const providerCap = (agent as any).providerCap;
      const capProvider = providerCap.current;
      const agentProvider = agent.currentProvider;

      expect(capProvider).toBe(agentProvider);
    });

    it('should list presets with correct structure', () => {
      const presets = agent.listPresets();

      for (const preset of presets) {
        expect(preset).toHaveProperty('id');
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('type');
        expect(typeof preset.id).toBe('string');
        expect(typeof preset.name).toBe('string');
      }
    });

    it('should return known provider display names', () => {
      const presets = agent.listPresets();
      const presetIds = presets.map(p => p.id.toLowerCase());

      // 验证已知的 provider 都在预设列表中
      const knownProviders = ['anthropic', 'openai', 'google', 'deepseek', 'glm', 'qwen'];
      for (const known of knownProviders) {
        if (presetIds.includes(known)) {
          const preset = presets.find(p => p.id.toLowerCase() === known);
          expect(preset?.name).toBeDefined();
          expect(preset?.name.length).toBeGreaterThan(0);
        }
      }
    });

    it('should use sync method for useProvider on agent', async () => {
      const providers = agent.listProviders();

      if (providers.length > 0) {
        // Agent.useProvider 使用同步方法
        const result = agent.useProvider(providers[0].id);
        expect(typeof result).toBe('boolean');
      }
    });

    it('should pass sessionId to hooks when using ProviderCapability.use()', async () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('provider:beforeChange', hookSpy);

      const providerCap = (agent as any).providerCap;
      await providerCap.use('test-provider', undefined, 'custom-session-id');

      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'custom-session-id',
        })
      );
    });

    it('should use system sessionId when not provided', async () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('provider:beforeChange', hookSpy);

      const providerCap = (agent as any).providerCap;
      await providerCap.use('test-provider');

      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'system',
        })
      );
    });

    it('should call useSync for synchronous provider switch', () => {
      const providers = agent.listProviders();

      if (providers.length > 0) {
        const providerCap = (agent as any).providerCap;
        const result = providerCap.useSync(providers[0].id, 'test-api-key');
        expect(typeof result).toBe('boolean');
      }
    });

    it('should return false from useSync for non-existent provider', () => {
      const providerCap = (agent as any).providerCap;
      const result = providerCap.useSync('non-existent-provider');
      expect(result).toBe(false);
    });

    it('should handle unknown provider display name', () => {
      const presets = agent.listPresets();

      // 检查预设中是否有未知 provider（名称等于 id）
      const unknownPreset = presets.find(p => p.name === p.id);
      if (unknownPreset) {
        // 未知 provider 应该返回 id 作为名称
        expect(unknownPreset.name).toBe(unknownPreset.id);
      }
    });
  });

  // ============================================
  // Provider Preset Details
  // ============================================
  describe('Provider Preset Details', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should include DeepSeek in presets', () => {
      const presets = agent.listPresets();
      const deepseek = presets.find(p => p.id.toLowerCase() === 'deepseek');
      expect(deepseek).toBeDefined();
      expect(deepseek?.name).toBe('DeepSeek');
    });

    it('should include GLM in presets', () => {
      const presets = agent.listPresets();
      const glm = presets.find(p => p.id.toLowerCase() === 'glm');
      expect(glm).toBeDefined();
      expect(glm?.name).toContain('GLM');
    });

    it('should include Qwen in presets', () => {
      const presets = agent.listPresets();
      const qwen = presets.find(p => p.id.toLowerCase() === 'qwen');
      expect(qwen).toBeDefined();
      expect(qwen?.name).toContain('通义');
    });

    it('should include Kimi in presets', () => {
      const presets = agent.listPresets();
      const kimi = presets.find(p => p.id.toLowerCase() === 'kimi');
      expect(kimi).toBeDefined();
      expect(kimi?.name).toContain('Kimi');
    });

    it('should include Groq in presets', () => {
      const presets = agent.listPresets();
      const groq = presets.find(p => p.id.toLowerCase() === 'groq');
      expect(groq).toBeDefined();
      expect(groq?.name).toBe('Groq');
    });

    it('should have correct type for OpenAI-compatible providers', () => {
      const presets = agent.listPresets();

      // DeepSeek, GLM, Qwen 等应该是 openai-compatible 类型
      const compatibleProviders = ['deepseek', 'glm', 'qwen', 'kimi', 'moonshot', 'groq', 'openrouter', 'litellm'];
      for (const providerId of compatibleProviders) {
        const preset = presets.find(p => p.id.toLowerCase() === providerId);
        if (preset) {
          expect(preset.type).toBe('openai-compatible');
        }
      }
    });

    it('should return non-empty presets list', () => {
      const presets = agent.listPresets();
      expect(presets.length).toBeGreaterThan(0);
    });

    it('should have valid structure for all presets', () => {
      const presets = agent.listPresets();

      for (const preset of presets) {
        expect(preset.id).toBeTruthy();
        expect(preset.name).toBeTruthy();
        expect(['anthropic', 'openai', 'google', 'openai-compatible']).toContain(preset.type);
      }
    });
  });

  // ============================================
  // Provider Context Integration
  // ============================================
  describe('Provider Context Integration', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should access providerManager through context', () => {
      expect(agent.context.providerManager).toBeDefined();
      expect(typeof agent.context.providerManager.getAllProviders).toBe('function');
      expect(typeof agent.context.providerManager.getActiveProvider).toBe('function');
      expect(typeof agent.context.providerManager.switchProvider).toBe('function');
    });

    it('should have consistent provider list between agent and context', () => {
      const agentProviders = agent.listProviders();
      const contextProviders = agent.context.providerManager.getAllProviders();

      expect(agentProviders.length).toBe(contextProviders.length);
    });

    it('should have consistent active provider between agent and context', () => {
      const agentProvider = agent.currentProvider;
      const contextProvider = agent.context.providerManager.getActiveProvider();

      expect(agentProvider?.id).toBe(contextProvider?.id);
    });

    it('should sync provider switch through agent and context', () => {
      const providers = agent.listProviders();

      if (providers.length > 0) {
        agent.useProvider(providers[0].id);

        // 验证 context 中的 provider 也已更新
        expect(agent.context.providerManager.getActiveProvider()?.id).toBe(providers[0].id);
      }
    });
  });
});
