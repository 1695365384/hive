/**
 * 参数适配测试
 *
 * 测试 preprocessParams 对不同提供商参数的适配行为
 */

import { describe, it, expect } from 'vitest';
import { preprocessParams } from '../../../src/providers/adapters/openai-compatible.js';

describe('preprocessParams', () => {
  describe('GLM provider', () => {
    it('should remove reasoning_effort parameter', () => {
      const params = {
        temperature: 0.7,
        reasoning_effort: 'high',
        maxTokens: 4096,
      };

      const result = preprocessParams('glm', params);

      expect(result).toEqual({
        temperature: 0.7,
        maxTokens: 4096,
      });
      expect('reasoning_effort' in result).toBe(false);
    });

    it('should remove temperature when out of [0, 1] range (too high)', () => {
      const params = {
        temperature: 2.0,
        maxTokens: 4096,
      };

      const result = preprocessParams('glm', params);

      expect(result).toEqual({ maxTokens: 4096 });
      expect('temperature' in result).toBe(false);
    });

    it('should remove temperature when out of [0, 1] range (negative)', () => {
      const params = {
        temperature: -0.5,
        maxTokens: 4096,
      };

      const result = preprocessParams('glm', params);

      expect(result).toEqual({ maxTokens: 4096 });
      expect('temperature' in result).toBe(false);
    });

    it('should keep temperature when within [0, 1] range', () => {
      const params = {
        temperature: 0.7,
        maxTokens: 4096,
      };

      const result = preprocessParams('glm', params);

      expect(result).toEqual({
        temperature: 0.7,
        maxTokens: 4096,
      });
    });

    it('should keep temperature at boundary values 0 and 1', () => {
      const result0 = preprocessParams('glm', { temperature: 0 });
      expect(result0).toEqual({ temperature: 0 });

      const result1 = preprocessParams('glm', { temperature: 1 });
      expect(result1).toEqual({ temperature: 1 });
    });

    it('should handle case-insensitive provider ID', () => {
      const params = { reasoning_effort: 'high' };
      const result = preprocessParams('GLM', params);
      expect('reasoning_effort' in result).toBe(false);
    });
  });

  describe('Kimi provider', () => {
    it('should convert string "true" stream to boolean true', () => {
      const params = { stream: 'true' as unknown };
      const result = preprocessParams('kimi', params);
      expect(result.stream).toBe(true);
    });

    it('should convert string "false" stream to boolean false', () => {
      const params = { stream: 'false' as unknown };
      const result = preprocessParams('kimi', params);
      expect(result.stream).toBe(false);
    });

    it('should convert numeric 1 stream to boolean true', () => {
      const params = { stream: 1 as unknown };
      const result = preprocessParams('kimi', params);
      expect(result.stream).toBe(true);
    });

    it('should keep boolean stream unchanged', () => {
      const params = { stream: true };
      const result = preprocessParams('kimi', params);
      expect(result.stream).toBe(true);
    });

    it('should convert non-true-like values to boolean false', () => {
      const params = { stream: 'yes' as unknown };
      const result = preprocessParams('kimi', params);
      expect(result.stream).toBe(false);
    });

    it('should not add stream if not present in params', () => {
      const params = { temperature: 0.7 };
      const result = preprocessParams('kimi', params);
      expect('stream' in result).toBe(false);
    });
  });

  describe('Unknown provider', () => {
    it('should return params unchanged for unknown provider', () => {
      const params = {
        temperature: 2.0,
        reasoning_effort: 'high',
        stream: 'true',
        maxTokens: 4096,
      };

      const result = preprocessParams('unknown-provider', params);

      expect(result).toEqual(params);
      expect(result).toStrictEqual(params);
    });

    it('should return empty params unchanged', () => {
      const params: Record<string, unknown> = {};
      const result = preprocessParams('some-provider', params);
      expect(result).toEqual({});
    });
  });
});
