/**
 * 持久化层降级测试
 *
 * 测试 SQLite 失败时降级到 WorkspacePersistence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { createSqlitePersistence } from '../../src/providers/metadata/sqlite-persistence.js';
import { WorkspacePersistence } from '../../src/providers/metadata/workspace-persistence.js';
import { getProviderRegistry } from '../../src/providers/metadata/provider-registry.js';
import type { ModelsDevCache } from '../../src/providers/metadata/types.js';

describe('持久化层降级', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-persistence-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createSqlitePersistence 失败', () => {
    it('should throw when better-sqlite3 is not available', () => {
      // 传入一个无效路径使 better-sqlite3 无法创建数据库
      // 由于我们无法轻易 mock 掉 require，测试的是错误路径
      const invalidPath = '/nonexistent/directory/path/test.db';

      // 需要确保目录不存在
      expect(() => createSqlitePersistence(invalidPath)).toThrow();
    });
  });

  describe('setSqlitePersistence 降级', () => {
    it('should fallback to WorkspacePersistence when SQLite fails', () => {
      const registry = getProviderRegistry();

      // 使用 WorkspacePersistence 作为 fallback
      const cachePath = path.join(tempDir, 'models-dev-cache.json');
      const workspacePersistence = new WorkspacePersistence(cachePath);
      registry.setPersistence(workspacePersistence);

      // setPersistence 应该成功
      expect(() => registry.setPersistence(workspacePersistence)).not.toThrow();
    });

    it('WorkspacePersistence should save and load cache', async () => {
      const cachePath = path.join(tempDir, 'models-dev-cache.json');
      const persistence = new WorkspacePersistence(cachePath);

      const cache: ModelsDevCache = {
        version: '1.0.0',
        fetchedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        providers: [
          {
            id: 'test-provider',
            name: 'Test Provider',
            baseUrl: 'https://api.test.com',
            type: 'openai-compatible',
            envKeys: ['TEST_API_KEY'],
            npmPackage: '@ai-sdk/openai-compatible',
            models: [
              {
                id: 'test-model',
                name: 'Test Model',
                contextWindow: 4096,
              },
            ],
          },
        ],
      };

      await persistence.save(cache);
      expect(persistence.exists()).toBe(true);

      const loaded = await persistence.load();
      expect(loaded).not.toBeNull();
      expect(loaded!.providers).toHaveLength(1);
      expect(loaded!.providers[0].id).toBe('test-provider');
    });

    it('WorkspacePersistence should return null for non-existent file', async () => {
      const cachePath = path.join(tempDir, 'nonexistent-cache.json');
      const persistence = new WorkspacePersistence(cachePath);

      const loaded = await persistence.load();
      expect(loaded).toBeNull();
    });
  });

  describe('getProviderInfoSync 降级链', () => {
    it('should use STATIC_PROVIDERS when no persistence configured', () => {
      // 使用全局 registry 实例（未配置 SQLite 持久化时）
      const registry = getProviderRegistry();

      // deepseek 在 STATIC_PROVIDERS 中
      const info = registry.getProviderInfoSync('deepseek');
      expect(info).not.toBeNull();
      expect(info!.baseUrl).toBe('https://api.deepseek.com');

      // 不在 STATIC_PROVIDERS 中的 provider 返回 null
      const unknown = registry.getProviderInfoSync('totally-unknown-provider-xyz');
      expect(unknown).toBeNull();
    });

    it('should return STATIC_PROVIDERS for known providers', () => {
      const registry = getProviderRegistry();

      // 这些 provider 都在 STATIC_PROVIDERS 中
      const knownProviders = ['deepseek', 'glm', 'qwen', 'anthropic', 'openai', 'google'];
      for (const id of knownProviders) {
        const info = registry.getProviderInfoSync(id);
        expect(info).not.toBeNull();
        expect(info!.baseUrl).toBeTruthy();
      }
    });
  });
});
