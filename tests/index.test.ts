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
  getPresets,
  getPresetsByCategory,
  getPreset,
  applyPreset,
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
  describe('预设列表', () => {
    it('should have presets', () => {
      const presets = getPresets();
      expect(presets.length).toBeGreaterThan(0);

      const presetIds = presets.map(p => p.id);
      expect(presetIds).toContain('anthropic');
      expect(presetIds).toContain('glm');
      expect(presetIds).toContain('deepseek');
    });
  });

  describe('预设分类', () => {
    it('should have categories', () => {
      const anthropicPresets = getPresetsByCategory('anthropic');
      expect(anthropicPresets.length).toBeGreaterThan(0);

      const chinesePresets = getPresetsByCategory('chinese');
      expect(chinesePresets.length).toBeGreaterThan(0);
    });
  });

  describe('创建提供商配置', () => {
    it('should create config from preset', () => {
      const preset = getPreset('deepseek');
      expect(preset).toBeDefined();

      const provider = applyPreset(preset!, 'test-api-key');
      expect(provider).toBeDefined();
      expect(provider.id).toBe('deepseek');
    });
  });

  describe('提供商管理器', () => {
    it('should create manager', () => {
      const manager = new ProviderManager();
      expect(manager).toBeDefined();
      expect(typeof manager.getActiveProvider).toBe('function');
      expect(typeof manager.getAllProviders).toBe('function');
      expect(typeof manager.switch).toBe('function');
      expect(typeof manager.listPresets).toBe('function');
    });
  });
});
