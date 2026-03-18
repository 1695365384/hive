/**
 * Provider 测试
 *
 * 测试提供商管理和适配器
 */

import { describe, it, expect } from 'vitest';
import {
  ProviderManager,
  createProviderManager,
  getProviderManager,
  getKnownProvidersSync,
  isKnownProvider,
  getProviderType,
  createAdapter,
  createOpenAIAdapter,
  createAnthropicAdapter,
  createGoogleAdapter,
  createOpenAICompatibleAdapter,
  getStaticModels,
} from '../../src/providers/index.js';
import type { ProviderConfig } from '../../src/providers/types.js';

describe('Provider Manager', () => {
  it('should create provider manager', () => {
    const manager = createProviderManager();
    expect(manager).toBeDefined();
  });

  it('should get global provider manager', () => {
    const manager = getProviderManager();
    expect(manager).toBeDefined();
  });

  it('should list all providers', () => {
    const manager = getProviderManager();
    const providers = manager.getAllProviders();
    expect(Array.isArray(providers)).toBe(true);
  });

  it('should get active provider', () => {
    const manager = getProviderManager();
    const active = manager.getActiveProvider();
    // May be null if no providers configured
    expect(active === null || typeof active === 'object').toBe(true);
  });
});

describe('Provider Adapters', () => {
  describe('Known Providers', () => {
    it('should return array of known providers', () => {
      const providers = getKnownProvidersSync();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
    });

    it('should identify known providers', () => {
      expect(isKnownProvider('deepseek')).toBe(true);
      expect(isKnownProvider('glm')).toBe(true);
      expect(isKnownProvider('qwen')).toBe(true);
      expect(isKnownProvider('unknown-provider')).toBe(false);
    });
  });

  describe('Provider Types', () => {
    it('should return correct provider type', () => {
      expect(getProviderType('openai')).toBe('openai');
      expect(getProviderType('anthropic')).toBe('anthropic');
      expect(getProviderType('google')).toBe('google');
      expect(getProviderType('deepseek')).toBe('openai-compatible');
    });
  });

  describe('OpenAI Adapter', () => {
    it('should create OpenAI adapter', () => {
      const adapter = createOpenAIAdapter();
      expect(adapter.type).toBe('openai');
      expect(adapter.getDefaultModel()).toBe('gpt-4o');
      expect(adapter.getProviderId()).toBe('openai');
    });

    it('should validate config', () => {
      const adapter = createOpenAIAdapter();
      const validConfig: ProviderConfig = {
        id: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com',
        apiKey: 'test-key',
      };
      expect(adapter.validateConfig(validConfig)).toBe(true);

      const invalidConfig: ProviderConfig = {
        id: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com',
      };
      expect(adapter.validateConfig(invalidConfig)).toBe(false);
    });
  });

  describe('Anthropic Adapter', () => {
    it('should create Anthropic adapter', () => {
      const adapter = createAnthropicAdapter();
      expect(adapter.type).toBe('anthropic');
      expect(adapter.getDefaultModel()).toBe('claude-sonnet-4-6');
      expect(adapter.getProviderId()).toBe('anthropic');
    });
  });

  describe('Google Adapter', () => {
    it('should create Google adapter', () => {
      const adapter = createGoogleAdapter();
      expect(adapter.type).toBe('google');
      expect(adapter.getDefaultModel()).toBe('gemini-2.0-flash');
      expect(adapter.getProviderId()).toBe('google');
    });
  });

  describe('OpenAI Compatible Adapter', () => {
    it('should create OpenAI compatible adapter', () => {
      const adapter = createOpenAICompatibleAdapter('deepseek');
      expect(adapter.type).toBe('openai-compatible');
      expect(adapter.getDefaultModel()).toBe('deepseek-chat');
      expect(adapter.getProviderId()).toBe('deepseek');
    });

    it('should throw error without baseUrl for unknown provider', () => {
      const adapter = createOpenAICompatibleAdapter('unknown');
      const config: ProviderConfig = {
        id: 'unknown',
        name: 'Unknown',
        baseUrl: '',
        apiKey: 'test-key',
      };
      expect(() => adapter.createModel(config)).toThrow();
    });
  });

  describe('Adapter Factory', () => {
    it('should create adapter by provider type', () => {
      const openaiAdapter = createAdapter({ id: 'test', name: 'Test', type: 'openai', baseUrl: '', apiKey: 'key' });
      expect(openaiAdapter.type).toBe('openai');

      const anthropicAdapter = createAdapter({ id: 'test', name: 'Test', type: 'anthropic', baseUrl: '', apiKey: 'key' });
      expect(anthropicAdapter.type).toBe('anthropic');
    });
  });
});

describe('Model Metadata', () => {
  describe('Static Models', () => {
    it('should return static models for known providers', () => {
      const anthropicModels = getStaticModels('anthropic');
      expect(anthropicModels.length).toBeGreaterThan(0);
      expect(anthropicModels.some(m => m.id.includes('claude'))).toBe(true);

      const openaiModels = getStaticModels('openai');
      expect(openaiModels.length).toBeGreaterThan(0);
      expect(openaiModels.some(m => m.id.includes('gpt'))).toBe(true);
    });

    it('should return empty array for unknown providers', () => {
      const models = getStaticModels('unknown-provider');
      expect(models).toEqual([]);
    });
  });
});
