/**
 * Provider 测试
 *
 * 测试提供商管理和预设配置
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_PRESETS,
  CHINESE_PROVIDERS,
  OPENAI_SERIES_PROVIDERS,
  GATEWAY_PROVIDERS,
  ANTHROPIC_PROVIDERS,
  getProviderPreset,
  listAllPresets,
  listPresetsByCategory,
} from '../../src/providers/presets.js';

describe('Provider Presets', () => {
  describe('ALL_PRESETS', () => {
    it('should have multiple presets', () => {
      const presetCount = Object.keys(ALL_PRESETS).length;
      expect(presetCount).toBeGreaterThan(5);
    });

    it('should include major providers', () => {
      expect(ALL_PRESETS.anthropic).toBeDefined();
      expect(ALL_PRESETS.openai).toBeDefined();
      expect(ALL_PRESETS.deepseek).toBeDefined();
      expect(ALL_PRESETS.glm).toBeDefined();
    });
  });

  describe('Provider Categories', () => {
    it('CHINESE_PROVIDERS should have Chinese providers', () => {
      expect(Object.keys(CHINESE_PROVIDERS).length).toBeGreaterThan(0);
    });

    it('OPENAI_SERIES_PROVIDERS should have OpenAI compatible providers', () => {
      expect(Object.keys(OPENAI_SERIES_PROVIDERS).length).toBeGreaterThan(0);
    });

    it('GATEWAY_PROVIDERS should have gateway providers', () => {
      expect(Object.keys(GATEWAY_PROVIDERS).length).toBeGreaterThan(0);
    });

    it('ANTHROPIC_PROVIDERS should have Anthropic', () => {
      expect(ANTHROPIC_PROVIDERS.anthropic).toBeDefined();
    });
  });

  describe('getProviderPreset', () => {
    it('should return preset for existing provider', () => {
      const preset = getProviderPreset('deepseek');
      expect(preset).toBeDefined();
      expect(preset?.id).toBe('deepseek');
    });

    it('should return undefined for non-existing provider', () => {
      const preset = getProviderPreset('non-existing');
      expect(preset).toBeUndefined();
    });
  });

  describe('listAllPresets', () => {
    it('should return array of presets', () => {
      const presets = listAllPresets();
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBeGreaterThan(0);
    });
  });

  describe('listPresetsByCategory', () => {
    it('should return categorized presets', () => {
      const categories = listPresetsByCategory();
      expect(categories).toBeDefined();
    });

    it('should have expected categories', () => {
      const categories = listPresetsByCategory();
      expect(categories).toHaveProperty('anthropic');
      expect(categories).toHaveProperty('chinese');
    });
  });
});
