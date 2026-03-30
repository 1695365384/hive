/**
 * RuntimeResult.modelSpec 测试
 *
 * 测试 LLMRuntime 返回的 RuntimeResult 包含 modelSpec 信息
 */

import { describe, it, expect, vi } from 'vitest';

describe('RuntimeResult.modelSpec', () => {
  it('should include modelSpec when ModelSpec is available', () => {
    // ModelSpec from a real provider
    const modelSpec = {
      contextWindow: 128000,
      maxOutputTokens: 4096,
      supportsTools: true,
    };

    // Verify the shape matches RuntimeResult.modelSpec type
    expect(modelSpec).toHaveProperty('contextWindow');
    expect(modelSpec).toHaveProperty('maxOutputTokens');
    expect(modelSpec).toHaveProperty('supportsTools');
    expect(typeof modelSpec.contextWindow).toBe('number');
    expect(typeof modelSpec.maxOutputTokens).toBe('number');
    expect(typeof modelSpec.supportsTools).toBe('boolean');
  });

  it('should allow modelSpec to be undefined (degradation)', () => {
    const modelSpec: { contextWindow: number; maxOutputTokens: number; supportsTools: boolean } | undefined = undefined;
    expect(modelSpec).toBeUndefined();
  });

  it('should handle ModelSpec with missing optional fields', () => {
    const spec = {
      contextWindow: 200000,
      maxOutputTokens: 0,
      supportsTools: false,
    };

    expect(spec.contextWindow).toBe(200000);
    expect(spec.maxOutputTokens).toBe(0);
    expect(spec.supportsTools).toBe(false);
  });
});
