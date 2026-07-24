/**
 * Hive Core 测试
 *
 * 核心功能测试
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/providers/ProviderManager.js', () => ({
  createProviderManager: vi.fn(() => ({
    active: null,
    all: [],
    switch: vi.fn(),
    register: vi.fn(),
  })),
  ProviderManager: vi.fn().mockImplementation(() => ({
    active: null,
    all: [],
    switch: vi.fn(),
    register: vi.fn(),
  })),
}));

import {
  Agent,
  createAgent,
  getAgent,
  BUILTIN_AGENTS,
  getAllAgentNames,
  ProviderManager,
  normalizeProviderId,
  warmPiCatalog,
  listPiProviders,
} from '../src/index.js';

describe('Agent 模块', () => {
  describe('内置 Agent 类型', () => {
    it('should have builtin agents', () => {
      expect(Object.keys(BUILTIN_AGENTS).length).toBeGreaterThan(0);
    });

    it('should get all agent names', () => {
      const names = getAllAgentNames();
      expect(names.length).toBeGreaterThan(0);
    });
  });

  describe('主 Agent', () => {
    it('should export Agent class', () => {
      expect(Agent).toBeDefined();
      expect(createAgent).toBeDefined();
      expect(getAgent).toBeDefined();
    });
  });
});

describe('Provider 模块', () => {
  it('should export ProviderManager', () => {
    expect(ProviderManager).toBeDefined();
  });

  it('should export pi catalog helpers', () => {
    expect(normalizeProviderId('glm')).toBe('zai');
    expect(typeof warmPiCatalog).toBe('function');
    expect(typeof listPiProviders).toBe('function');
  });
});
