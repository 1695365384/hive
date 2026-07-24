/**
 * Provider 测试 — ProviderManager + pi catalog 集成
 */

import { describe, it, expect } from 'vitest';
import {
  createProviderManager,
  normalizeProviderId,
  warmPiCatalog,
  listPiProviders,
} from '../../src/providers/index.js';

describe('Provider Manager', () => {
  it('should create provider manager', () => {
    const manager = createProviderManager();
    expect(manager).toBeDefined();
  });

  it('should list all providers', () => {
    const manager = createProviderManager();
    expect(Array.isArray(manager.all)).toBe(true);
  });

  it('should get active provider', () => {
    const manager = createProviderManager();
    const active = manager.active;
    expect(active === null || typeof active === 'object').toBe(true);
  });
});

describe('Pi catalog exports', () => {
  it('normalizes legacy provider ids', () => {
    expect(normalizeProviderId('glm')).toBe('zai');
    expect(normalizeProviderId('kimi')).toBe('moonshot');
  });

  it('lists providers after warm', async () => {
    await warmPiCatalog(true);
    const providers = await listPiProviders();
    expect(providers.length).toBeGreaterThan(10);
    expect(providers.every((p) => p.id && p.name && Array.isArray(p.models))).toBe(true);
  });
});
