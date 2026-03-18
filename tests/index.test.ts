/**
 * Claude Agent Service 测试
 *
 * 核心功能测试
 */

import { describe, it, expect } from 'vitest';
import {
  // Agent 模块
  Agent,
  createAgent,
  getAgent,
  AgentRunner,
  BUILTIN_AGENTS,
  EXTENDED_AGENTS,
  getAllAgentNames,
  getCoreAgentNames,
  getExtendedAgentNames,

  // Provider 模块
  ProviderManager,
  getKnownProvidersSync,
  isKnownProvider,
  getProviderType,
  createAdapter,
  getStaticModels,
} from '../src/index.js';

describe('Agent 模块', () => {
  describe('内置 Agent 类型', () => {
    it('should have core agents', () => {
      const coreAgents = getCoreAgentNames();
      expect(coreAgents).toContain('explore');
      expect(coreAgents).toContain('plan');
      expect(coreAgents).toContain('general');
      expect(coreAgents).toHaveLength(3);
    });
  });

  describe('扩展 Agent', () => {
    it('should have extended agents', () => {
      const extendedAgents = getExtendedAgentNames();
      expect(extendedAgents).toContain('code-reviewer');
      expect(extendedAgents).toContain('test-engineer');
      expect(extendedAgents).toContain('doc-writer');
    });
  });

  describe('所有 Agent', () => {
    it('should have all agents', () => {
      const allAgents = getAllAgentNames();
      expect(allAgents.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('Agent 配置', () => {
    it('should have valid explore config', () => {
      const exploreConfig = BUILTIN_AGENTS['explore'];
      expect(exploreConfig).toBeDefined();
      expect(exploreConfig?.type).toBe('explore');
      expect(exploreConfig?.tools).toBeDefined();
      expect(exploreConfig?.tools).toContain('Read');
      expect(exploreConfig?.tools).toContain('Glob');
      expect(exploreConfig?.tools).toContain('Grep');
    });
  });

  describe('AgentRunner', () => {
    it('should create AgentRunner', () => {
      const runner = new AgentRunner();
      expect(runner).toBeDefined();
      expect(typeof runner.execute).toBe('function');
      expect(typeof runner.explore).toBe('function');
      expect(typeof runner.plan).toBe('function');
      expect(typeof runner.general).toBe('function');
    });
  });

  describe('主 Agent', () => {
    it('should create Agent', () => {
      const agent = new Agent();
      expect(agent).toBeDefined();
      expect(typeof agent.chat).toBe('function');
      expect(typeof agent.explore).toBe('function');
      expect(typeof agent.plan).toBe('function');
      expect(typeof agent.general).toBe('function');
      expect(typeof agent.useProvider).toBe('function');
    });
  });

  describe('便捷函数', () => {
    it('createAgent should work', () => {
      const agent = createAgent();
      expect(agent).toBeDefined();
    });

    it('getAgent should return same instance', () => {
      const agent1 = getAgent();
      const agent2 = getAgent();
      expect(agent1).toBe(agent2);
    });
  });
});

describe('Provider 模块', () => {
  describe('已知提供商', () => {
    it('should have known providers', () => {
      const providers = getKnownProvidersSync();
      expect(providers.length).toBeGreaterThan(0);
      expect(providers).toContain('deepseek');
      expect(providers).toContain('glm');
      expect(providers).toContain('qwen');
    });
  });

  describe('提供商类型', () => {
    it('should identify provider types', () => {
      expect(getProviderType('openai')).toBe('openai');
      expect(getProviderType('anthropic')).toBe('anthropic');
      expect(getProviderType('google')).toBe('google');
      expect(getProviderType('deepseek')).toBe('openai-compatible');
    });

    it('should identify known providers', () => {
      expect(isKnownProvider('deepseek')).toBe(true);
      expect(isKnownProvider('glm')).toBe(true);
      expect(isKnownProvider('unknown')).toBe(false);
    });
  });

  describe('静态模型', () => {
    it('should return static models for known providers', () => {
      const anthropicModels = getStaticModels('anthropic');
      expect(anthropicModels.length).toBeGreaterThan(0);
      expect(anthropicModels.some(m => m.id.includes('claude'))).toBe(true);

      const openaiModels = getStaticModels('openai');
      expect(openaiModels.length).toBeGreaterThan(0);
      expect(openaiModels.some(m => m.id.includes('gpt'))).toBe(true);
    });
  });

  describe('适配器工厂', () => {
    it('should create adapter by type', () => {
      const adapter = createAdapter({
        id: 'test',
        name: 'Test',
        type: 'openai',
        baseUrl: '',
        apiKey: 'test-key',
      });
      expect(adapter.type).toBe('openai');
    });
  });

  describe('提供商管理器', () => {
    it('should create manager', () => {
      const manager = new ProviderManager();
      expect(manager).toBeDefined();
      expect(typeof manager.getActiveProvider).toBe('function');
      expect(typeof manager.getAllProviders).toBe('function');
      expect(typeof manager.switch).toBe('function');
    });
  });
});
