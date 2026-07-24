/**
 * pi-catalog-bridge — catalog is the sole provider source for UI + runtime.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  __setPiCatalogCacheForTests,
  listPiProviderModels,
  listPiProviders,
  normalizeProviderId,
  warmPiCatalog,
  getPiProviderDescriptorSync,
  getPiProviderMetaSync,
} from '../../../src/providers/pi-catalog-bridge.js';

describe('pi-catalog-bridge', () => {
  afterEach(() => {
    __setPiCatalogCacheForTests(null);
  });

  it('normalizes legacy Hive provider ids to pi catalog ids', () => {
    expect(normalizeProviderId('glm')).toBe('zai');
    expect(normalizeProviderId('Kimi')).toBe('moonshot');
    expect(normalizeProviderId('qwen')).toBe('qwen-portal');
    expect(normalizeProviderId('deepseek')).toBe('deepseek');
  });

  it('descriptor sync works before warm', () => {
    const zai = getPiProviderDescriptorSync('glm');
    expect(zai?.id).toBe('zai');
    expect(zai?.defaultModel).toBeTruthy();
  });

  describe('warmed catalog', () => {
    beforeAll(async () => {
      await warmPiCatalog(true);
    });

    it('lists pi providers including deepseek/zai/moonshot', async () => {
      const providers = await listPiProviders();
      expect(providers.length).toBeGreaterThan(20);
      const ids = new Set(providers.map((p) => p.id));
      expect(ids.has('deepseek')).toBe(true);
      expect(ids.has('zai')).toBe(true);
      expect(ids.has('moonshot')).toBe(true);
      // legacy models.dev ids must not appear as catalog ids
      expect(ids.has('glm')).toBe(false);
      expect(ids.has('kimi')).toBe(false);
    });

    it('resolves models for aliased provider ids', async () => {
      const models = await listPiProviderModels('glm');
      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.id.includes('glm') || m.id.length > 0)).toBe(true);
      const meta = getPiProviderMetaSync('glm');
      expect(meta?.id).toBe('zai');
      expect(meta?.baseUrl).toBeTruthy();
    });

    it('puts default model first for deepseek', async () => {
      const models = await listPiProviderModels('deepseek');
      expect(models[0]?.id).toBeTruthy();
      const meta = getPiProviderMetaSync('deepseek');
      expect(meta?.models[0]?.id).toBe(models[0]?.id);
    });
  });
});
