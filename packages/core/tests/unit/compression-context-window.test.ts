/**
 * CompressionService 动态 contextWindowSize 测试
 *
 * 测试 CompressionService 接受动态 contextWindowSize 参数
 */

import { describe, it, expect } from 'vitest';
import { createCompressionService } from '../../src/compression/CompressionService.js';

describe('CompressionService dynamic contextWindowSize', () => {
  it('should use provided contextWindowSize', () => {
    const service = createCompressionService({
      compression: { contextWindowSize: 64000 },
    });

    const config = service.getConfig();
    expect(config.contextWindowSize).toBe(64000);
  });

  it('should use default contextWindowSize when not provided', () => {
    const service = createCompressionService();
    const config = service.getConfig();
    expect(config.contextWindowSize).toBe(200000);
  });

  it('should calculate threshold based on contextWindowSize', () => {
    const service = createCompressionService({
      compression: { contextWindowSize: 64000, thresholdPercentage: 0.8 },
    });

    const threshold = service.getThreshold();
    // threshold = contextWindowSize * thresholdPercentage
    expect(threshold).toBe(64000 * 0.8);
  });

  it('should reflect contextWindowSize in compression context', () => {
    const service = createCompressionService({
      compression: { contextWindowSize: 128000 },
    });

    const context = service.createContext([]);
    expect(context.contextWindowSize).toBe(128000);
  });

  it('should support updateConfig to change contextWindowSize', () => {
    const service = createCompressionService({
      compression: { contextWindowSize: 64000 },
    });

    service.updateConfig({ contextWindowSize: 200000 });
    expect(service.getConfig().contextWindowSize).toBe(200000);
  });
});
