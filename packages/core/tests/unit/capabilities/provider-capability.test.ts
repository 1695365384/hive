/**
 * ProviderCapability 单元测试
 *
 * 测试提供商管理能力
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderCapability } from '../../../src/agents/capabilities/ProviderCapability.js';
import {
  createMockAgentContext,
  createTestProviderConfig,
} from '../../mocks/agent-context.mock.js';
import type { AgentContext } from '../../../src/agents/core/types.js';

describe('ProviderCapability', () => {
  let capability: ProviderCapability;
  let context: AgentContext;

  // 测试用提供商配置
  const testProvider = createTestProviderConfig({
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'ds-test-key',
    model: 'deepseek-chat',
  });

  const anotherProvider = createTestProviderConfig({
    id: 'glm',
    name: 'GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: 'glm-test-key',
    model: 'glm-4',
  });

  beforeEach(() => {
    capability = new ProviderCapability();
    context = createMockAgentContext({
      activeProvider: testProvider,
      providers: [testProvider, anotherProvider],
    });
    capability.initialize(context);
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('生命周期', () => {
    it('should initialize correctly', () => {
      expect(capability.name).toBe('provider');
    });

    it('should have correct name', () => {
      expect(capability.name).toBe('provider');
    });
  });

  // ============================================
  // current 属性测试
  // ============================================

  describe('current', () => {
    it('should return current provider', () => {
      const current = capability.current;
      expect(current).toEqual(testProvider);
    });

    it('should return null when no provider is active', () => {
      const emptyContext = createMockAgentContext({
        activeProvider: null,
        providers: [],
      });
      const emptyCapability = new ProviderCapability();
      emptyCapability.initialize(emptyContext);

      expect(emptyCapability.current).toBeNull();
    });
  });

  // ============================================
  // listAll() 测试
  // ============================================

  describe('listAll()', () => {
    it('should list all providers', () => {
      const providers = capability.listAll();
      expect(providers).toHaveLength(2);
      expect(providers).toContainEqual(testProvider);
      expect(providers).toContainEqual(anotherProvider);
    });

    it('should return empty array when no providers', () => {
      const emptyContext = createMockAgentContext({
        activeProvider: null,
        providers: [],
      });
      const emptyCapability = new ProviderCapability();
      emptyCapability.initialize(emptyContext);

      expect(emptyCapability.listAll()).toEqual([]);
    });
  });

  // ============================================
  // listPresets() 测试
  // ============================================

  describe('listPresets()', () => {
    it('should list known provider presets', () => {
      const presets = capability.listPresets();
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBeGreaterThan(0);
    });

    it('should return preset with correct structure', () => {
      const presets = capability.listPresets();
      // 使用已知的 OpenAI 兼容提供商
      const deepseekPreset = presets.find(p => p.id === 'deepseek');

      expect(deepseekPreset).toBeDefined();
      expect(deepseekPreset?.name).toBe('DeepSeek');
      expect(deepseekPreset?.type).toBe('openai-compatible');
    });

    it('should include Chinese provider names', () => {
      const presets = capability.listPresets();
      const glmPreset = presets.find(p => p.id === 'glm');

      expect(glmPreset).toBeDefined();
      expect(glmPreset?.name).toContain('GLM');
    });

    it('should include all known OpenAI-compatible providers', () => {
      const presets = capability.listPresets();
      const knownProviders = ['deepseek', 'glm', 'qwen', 'kimi', 'moonshot', 'groq'];

      for (const providerId of knownProviders) {
        const preset = presets.find(p => p.id === providerId);
        if (preset) {
          expect(preset.type).toBe('openai-compatible');
        }
      }
    });
  });

  // ============================================
  // use() 测试
  // ============================================

  describe('use()', () => {
    it('should switch provider successfully', async () => {
      const result = await capability.use('glm');

      expect(result).toBe(true);
      expect(context.providerManager.switchProvider).toHaveBeenCalledWith('glm', undefined);
    });

    it('should switch provider with API key', async () => {
      const newApiKey = 'new-api-key';
      const result = await capability.use('glm', newApiKey);

      expect(result).toBe(true);
      expect(context.providerManager.switchProvider).toHaveBeenCalledWith('glm', newApiKey);
    });

    it('should trigger provider:beforeChange hook', async () => {
      await capability.use('glm', undefined, 'session-123');

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'provider:beforeChange',
        expect.objectContaining({
          sessionId: 'session-123',
          newProviderId: 'glm',
        })
      );
    });

    it('should trigger provider:afterChange hook on success', async () => {
      await capability.use('glm');

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'provider:afterChange',
        expect.objectContaining({
          newProvider: 'glm',
          success: true,
        })
      );
    });

    it('should abort switch if beforeChange hook returns false', async () => {
      // 重新设置 mock 使 emit 返回 false
      vi.mocked(context.hookRegistry.emit).mockResolvedValueOnce(false);

      const result = await capability.use('glm');

      expect(result).toBe(false);
    });

    it('should use default session ID when not provided', async () => {
      await capability.use('glm');

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'provider:beforeChange',
        expect.objectContaining({
          sessionId: 'system',
        })
      );
    });
  });

  // ============================================
  // useSync() 测试
  // ============================================

  describe('useSync()', () => {
    it('should switch provider synchronously', () => {
      const result = capability.useSync('glm');

      expect(result).toBe(true);
      expect(context.providerManager.switchProvider).toHaveBeenCalledWith('glm', undefined);
    });

    it('should switch provider with API key', () => {
      const newApiKey = 'new-api-key';
      const result = capability.useSync('glm', newApiKey);

      expect(result).toBe(true);
      expect(context.providerManager.switchProvider).toHaveBeenCalledWith('glm', newApiKey);
    });

    it('should not trigger hooks', () => {
      capability.useSync('glm');

      // useSync 不应该触发 hooks
      expect(context.hookRegistry.emit).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // isCCSwitchInstalled() 测试
  // ============================================

  describe('isCCSwitchInstalled()', () => {
    it('should return false when CC-Switch not installed', () => {
      const result = capability.isCCSwitchInstalled();
      expect(result).toBe(false);
    });

    it('should return true when CC-Switch is installed', () => {
      vi.mocked(context.providerManager.isCCSwitchInstalled).mockReturnValue(true);

      const result = capability.isCCSwitchInstalled();
      expect(result).toBe(true);
    });
  });

  // ============================================
  // 错误处理测试
  // ============================================

  describe('错误处理', () => {
    it('should handle invalid provider name', async () => {
      vi.mocked(context.providerManager.switchProvider).mockReturnValue(false);

      const result = await capability.use('invalid-provider');

      expect(result).toBe(false);
    });
  });
});
