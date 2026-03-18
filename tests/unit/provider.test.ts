/**
 * Provider 测试
 *
 * 测试提供商管理和预设配置
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_PRESETS,
  ANTHROPIC_PRESETS,
  OPENAI_PRESETS,
  CHINESE_PRESETS,
  GATEWAY_PRESETS,
  getPreset,
  getPresets,
  getPresetsByCategory,
} from '../../src/providers/index.js';

describe('Provider Presets', () => {
  describe('ALL_PRESETS', () => {
    it('should have multiple presets', () => {
      expect(ALL_PRESETS.length).toBeGreaterThan(5);
    });

    it('should include major providers', () => {
      const ids = ALL_PRESETS.map(p => p.id);
      expect(ids).toContain('anthropic');
      expect(ids).toContain('openai');
      expect(ids).toContain('deepseek');
      expect(ids).toContain('glm');
    });
  });

  describe('Provider Categories', () => {
    it('CHINESE_PRESETS should have Chinese providers', () => {
      expect(CHINESE_PRESETS.length).toBeGreaterThan(0);
    });

    it('OPENAI_PRESETS should have OpenAI providers', () => {
      expect(OPENAI_PRESETS.length).toBeGreaterThan(0);
    });

    it('GATEWAY_PRESETS should have gateway providers', () => {
      expect(GATEWAY_PRESETS.length).toBeGreaterThan(0);
    });

    it('ANTHROPIC_PRESETS should have Anthropic', () => {
      expect(ANTHROPIC_PRESETS.some(p => p.id === 'anthropic')).toBe(true);
    });
  });

  describe('getPreset', () => {
    it('should return preset for existing provider', () => {
      const preset = getPreset('deepseek');
      expect(preset).toBeDefined();
      expect(preset?.id).toBe('deepseek');
    });

    it('should return undefined for non-existing provider', () => {
      const preset = getPreset('non-existing');
      expect(preset).toBeUndefined();
    });
  });

  describe('getPresets', () => {
    it('should return array of presets', () => {
      const presets = getPresets();
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBeGreaterThan(0);
    });
  });

  describe('getPresetsByCategory', () => {
    it('should return presets for specific category', () => {
      const anthropicPresets = getPresetsByCategory('anthropic');
      expect(anthropicPresets.length).toBeGreaterThan(0);
      expect(anthropicPresets.every(p => p.category === 'anthropic')).toBe(true);
    });

    it('should return chinese presets', () => {
      const chinesePresets = getPresetsByCategory('chinese');
      expect(chinesePresets.length).toBeGreaterThan(0);
      expect(chinesePresets.every(p => p.category === 'chinese')).toBe(true);
    });
  });
});
