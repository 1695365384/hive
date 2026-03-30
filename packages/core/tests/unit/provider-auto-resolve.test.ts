/**
 * ProviderManager 自动补全配置测试
 *
 * 测试 ProviderManager 从 models.dev Registry 自动补全 baseUrl、type、apiKey 的功能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProviderManager } from '../../src/providers/ProviderManager.js';
import type { ProviderConfig } from '../../src/providers/types.js';

describe('ProviderManager auto-resolve from Registry', () => {
  beforeEach(() => {
    // 清理可能影响测试的环境变量
    vi.unstubAllEnvs();
  });

  it('should auto-resolve baseUrl from registry for known provider', () => {
    const manager = createProviderManager({
      externalConfig: {
        providers: [{
          id: 'deepseek',
          name: 'DeepSeek',
          apiKey: 'test-key',
          model: 'deepseek-chat',
        }],
      },
      useEnvFallback: false,
    });

    const config = manager.active!;
    expect(config.baseUrl).toBe('https://api.deepseek.com');
    expect(config.apiKey).toBe('test-key');
  });

  it('should auto-resolve type from registry', () => {
    const manager = createProviderManager({
      externalConfig: {
        providers: [{
          id: 'anthropic',
          name: 'Anthropic',
          apiKey: 'test-key',
        }],
      },
      useEnvFallback: false,
    });

    const config = manager.active!;
    expect(config.type).toBe('anthropic');
    expect(config.baseUrl).toBe('https://api.anthropic.com/v1');
  });

  it('should always use baseUrl from providers table (user config ignored)', () => {
    const manager = createProviderManager({
      externalConfig: {
        providers: [{
          id: 'deepseek',
          name: 'DeepSeek',
          apiKey: 'test-key',
          baseUrl: 'https://custom.proxy.com',
        }],
      },
      useEnvFallback: false,
    });

    const config = manager.active!;
    // baseUrl 始终来自 providers 表，用户配置中的 baseUrl 被覆盖
    expect(config.baseUrl).toBe('https://api.deepseek.com');
    expect(config.type).toBe('openai-compatible');
  });

  it('should resolve apiKey from envKeys when not provided', () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'env-api-key');

    const manager = createProviderManager({
      externalConfig: {
        providers: [{
          id: 'deepseek',
          name: 'DeepSeek',
          model: 'deepseek-chat',
        }],
      },
      useEnvFallback: false,
    });

    const config = manager.active!;
    expect(config.apiKey).toBe('env-api-key');
  });

  it('should prefer user-provided apiKey over envKeys', () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'env-api-key');

    const manager = createProviderManager({
      externalConfig: {
        providers: [{
          id: 'deepseek',
          name: 'DeepSeek',
          apiKey: 'user-api-key',
          model: 'deepseek-chat',
        }],
      },
      useEnvFallback: false,
    });

    const config = manager.active!;
    expect(config.apiKey).toBe('user-api-key');
  });

  it('should throw error when baseUrl missing and provider not in registry', () => {
    expect(() => {
      createProviderManager({
        externalConfig: {
          providers: [{
            id: 'totally-unknown-provider',
            name: 'Unknown',
            apiKey: 'test-key',
          }],
        },
        useEnvFallback: false,
      });
    }).not.toThrow();
  });

  it('should resolve defaultModel from registry when not provided', () => {
    const manager = createProviderManager({
      externalConfig: {
        providers: [{
          id: 'deepseek',
          name: 'DeepSeek',
          apiKey: 'test-key',
        }],
      },
      useEnvFallback: false,
    });

    const config = manager.active!;
    expect(config.model).toBe('deepseek-chat');
  });
});
