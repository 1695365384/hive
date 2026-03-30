/**
 * Provider Registry 测试
 *
 * 测试 models.dev 动态 Provider 注册表的配置补全功能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProviderInfoSync } from '../../src/providers/metadata/provider-registry.js';

describe('getProviderInfoSync', () => {
  it('should return info for known provider (deepseek)', () => {
    const info = getProviderInfoSync('deepseek');
    expect(info).not.toBeNull();
    expect(info!.baseUrl).toBe('https://api.deepseek.com');
    expect(info!.type).toBe('openai-compatible');
    expect(info!.envKeys).toContain('DEEPSEEK_API_KEY');
  });

  it('should return info for known provider (glm)', () => {
    const info = getProviderInfoSync('glm');
    expect(info).not.toBeNull();
    expect(info!.baseUrl).toContain('bigmodel.cn');
    expect(info!.type).toBe('openai-compatible');
    expect(info!.envKeys).toContain('GLM_API_KEY');
  });

  it('should return info for known provider (qwen)', () => {
    const info = getProviderInfoSync('qwen');
    expect(info).not.toBeNull();
    expect(info!.baseUrl).toContain('dashscope.aliyuncs.com');
    expect(info!.type).toBe('openai-compatible');
    expect(info!.envKeys).toContain('QWEN_API_KEY');
  });

  it('should return null for unknown provider', () => {
    const info = getProviderInfoSync('completely-unknown-provider');
    expect(info).toBeNull();
  });

  it('should be case-insensitive', () => {
    const info = getProviderInfoSync('DeepSeek');
    expect(info).not.toBeNull();
    expect(info!.baseUrl).toBe('https://api.deepseek.com');
  });
});
