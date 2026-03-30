/**
 * SqlitePersistence 单元测试
 *
 * 测试 SQLite 持久化层的 schema 初始化、save/load、快速查询
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { ModelsDevCache } from '../../src/providers/metadata/types.js';
import type { ModelsDevProvider, ModelSpec } from '../../src/providers/types.js';
import { createSqlitePersistence, SqlitePersistence } from '../../src/providers/metadata/sqlite-persistence.js';

describe('SqlitePersistence', () => {
  let dbPath: string;
  let persistence: SqlitePersistence;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-models-dev-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    persistence = createSqlitePersistence(dbPath);
  });

  afterEach(() => {
    persistence.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  // ============================================
  // Schema 初始化测试
  // ============================================

  describe('schema 初始化', () => {
    it('should create database file on initialization', () => {
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('should create providers table', () => {
      const result = persistence['db'].prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='providers'"
      ).get();
      expect(result).toBeDefined();
    });

    it('should create models table', () => {
      const result = persistence['db'].prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='models'"
      ).get();
      expect(result).toBeDefined();
    });

    it('should create index on models.provider_id', () => {
      const result = persistence['db'].prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_models_provider'"
      ).get();
      expect(result).toBeDefined();
    });
  });

  // ============================================
  // save() / load() 测试
  // ============================================

  describe('save() / load()', () => {
    const validCache: ModelsDevCache = {
      version: '1.0.0',
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      providers: [
        {
          id: 'deepseek',
          name: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com',
          type: 'openai-compatible',
          envKeys: ['DEEPSEEK_API_KEY'],
          npmPackage: '@ai-sdk/openai-compatible',
          models: [
            {
              id: 'deepseek-chat',
              name: 'DeepSeek Chat',
              contextWindow: 128000,
              maxOutputTokens: 8192,
              supportsVision: false,
              supportsTools: true,
            },
            {
              id: 'deepseek-reasoner',
              name: 'DeepSeek Reasoner',
              contextWindow: 64000,
              maxOutputTokens: 8192,
              supportsTools: false,
            },
          ],
        },
        {
          id: 'anthropic',
          name: 'Anthropic',
          baseUrl: 'https://api.anthropic.com/v1',
          type: 'anthropic',
          envKeys: ['ANTHROPIC_API_KEY'],
          npmPackage: '@ai-sdk/anthropic',
          models: [
            {
              id: 'claude-sonnet-4-6',
              name: 'Claude Sonnet 4.6',
              contextWindow: 200000,
              maxOutputTokens: 16000,
              supportsVision: true,
              supportsTools: true,
            },
          ],
        },
      ],
    };

    it('should save and load cache', async () => {
      await persistence.save(validCache);

      const loaded = await persistence.load();
      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe('1.0.0');
      expect(loaded!.providers).toHaveLength(2);
    });

    it('should load providers with correct data', async () => {
      await persistence.save(validCache);

      const loaded = await persistence.load();
      const deepseek = loaded!.providers.find(p => p.id === 'deepseek')!;
      expect(deepseek.name).toBe('DeepSeek');
      expect(deepseek.baseUrl).toBe('https://api.deepseek.com');
      expect(deepseek.type).toBe('openai-compatible');
      expect(deepseek.envKeys).toEqual(['DEEPSEEK_API_KEY']);
      expect(deepseek.models).toHaveLength(2);
    });

    it('should load models with correct data', async () => {
      await persistence.save(validCache);

      const loaded = await persistence.load();
      const deepseek = loaded!.providers.find(p => p.id === 'deepseek')!;
      const chat = deepseek.models.find(m => m.id === 'deepseek-chat')!;
      expect(chat.name).toBe('DeepSeek Chat');
      expect(chat.contextWindow).toBe(128000);
      expect(chat.maxOutputTokens).toBe(8192);
      expect(chat.supportsVision).toBe(false);
      expect(chat.supportsTools).toBe(true);
    });

    it('should return null for expired cache', async () => {
      const expiredCache: ModelsDevCache = {
        ...validCache,
        fetchedAt: new Date(Date.now() - 100000000).toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };

      await persistence.save(expiredCache);
      const loaded = await persistence.load();
      expect(loaded).toBeNull();
    });

    it('should return null for empty database', async () => {
      const loaded = await persistence.load();
      expect(loaded).toBeNull();
    });

    it('should replace data on second save', async () => {
      await persistence.save(validCache);

      const updatedCache: ModelsDevCache = {
        ...validCache,
        fetchedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        providers: [
          {
            id: 'glm',
            name: '智谱 GLM',
            baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
            type: 'openai-compatible',
            envKeys: ['GLM_API_KEY'],
            npmPackage: '@ai-sdk/openai-compatible',
            models: [
              {
                id: 'glm-4-flash',
                name: 'GLM-4 Flash',
                contextWindow: 128000,
                maxOutputTokens: 4096,
              },
            ],
          },
        ],
      };

      await persistence.save(updatedCache);
      const loaded = await persistence.load();
      // save() 使用 upsert，不会清除已有数据，所以是 2+1=3
      expect(loaded!.providers).toHaveLength(3);
      const glm = loaded!.providers.find(p => p.id === 'glm');
      expect(glm).toBeDefined();
      expect(glm!.name).toBe('智谱 GLM');
    });
  });

  // ============================================
  // getModelSpec() 快速查询测试
  // ============================================

  describe('getModelSpec()', () => {
    const cacheWithCost: ModelsDevCache = {
      version: '1.0.0',
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      providers: [
        {
          id: 'deepseek',
          name: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com',
          type: 'openai-compatible',
          envKeys: ['DEEPSEEK_API_KEY'],
          npmPackage: '@ai-sdk/openai-compatible',
          models: [
            {
              id: 'deepseek-chat',
              name: 'DeepSeek Chat',
              contextWindow: 128000,
              maxOutputTokens: 8192,
              supportsTools: true,
            },
          ],
        },
      ],
    };

    beforeEach(async () => {
      await persistence.save(cacheWithCost);
    });

    it('should return ModelSpec for existing model', () => {
      const spec = persistence.getModelSpec('deepseek', 'deepseek-chat');
      expect(spec).not.toBeNull();
      expect(spec!.id).toBe('deepseek-chat');
      expect(spec!.name).toBe('DeepSeek Chat');
      expect(spec!.contextWindow).toBe(128000);
      expect(spec!.maxOutputTokens).toBe(8192);
      expect(spec!.supportsTools).toBe(true);
    });

    it('should return null for non-existent model', () => {
      const spec = persistence.getModelSpec('deepseek', 'nonexistent');
      expect(spec).toBeNull();
    });

    it('should return null for non-existent provider', () => {
      const spec = persistence.getModelSpec('nonexistent', 'some-model');
      expect(spec).toBeNull();
    });

    it('should be case-insensitive for provider', () => {
      const spec = persistence.getModelSpec('DeepSeek', 'deepseek-chat');
      expect(spec).not.toBeNull();
      expect(spec!.id).toBe('deepseek-chat');
    });
  });

  // ============================================
  // getProviderInfo() 快速查询测试
  // ============================================

  describe('getProviderInfo()', () => {
    const cache: ModelsDevCache = {
      version: '1.0.0',
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      providers: [
        {
          id: 'deepseek',
          name: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com',
          type: 'openai-compatible',
          envKeys: ['DEEPSEEK_API_KEY'],
          npmPackage: '@ai-sdk/openai-compatible',
          models: [
            {
              id: 'deepseek-chat',
              name: 'DeepSeek Chat',
              contextWindow: 128000,
            },
          ],
        },
      ],
    };

    beforeEach(async () => {
      await persistence.save(cache);
    });

    it('should return ProviderInfo for existing provider', () => {
      const info = persistence.getProviderInfo('deepseek');
      expect(info).not.toBeNull();
      expect(info!.providerId).toBe('deepseek');
      expect(info!.name).toBe('DeepSeek');
      expect(info!.baseUrl).toBe('https://api.deepseek.com');
      expect(info!.type).toBe('openai-compatible');
      expect(info!.envKeys).toEqual(['DEEPSEEK_API_KEY']);
      expect(info!.npmPackage).toBe('@ai-sdk/openai-compatible');
    });

    it('should return null for non-existent provider', () => {
      const info = persistence.getProviderInfo('nonexistent');
      expect(info).toBeNull();
    });

    it('should be case-insensitive', () => {
      const info = persistence.getProviderInfo('DeepSeek');
      expect(info).not.toBeNull();
      expect(info!.providerId).toBe('deepseek');
    });
  });

  // ============================================
  // 辅助方法测试
  // ============================================

  describe('辅助方法', () => {
    it('should return db path', () => {
      expect(persistence.getDbPath()).toBe(dbPath);
    });
  });

  // ============================================
  // saveFullData() 新字段测试
  // ============================================

  describe('saveFullData() 新字段', () => {
    const fullProviders: ModelsDevProvider[] = [
      {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        envKeys: ['DEEPSEEK_API_KEY'],
        npmPackage: '@ai-sdk/openai-compatible',
        type: 'openai-compatible',
        logo: 'https://models.dev/logos/deepseek.svg',
        models: [
          {
            id: 'deepseek-chat',
            name: 'DeepSeek Chat',
            family: 'deepseek',
            contextWindow: 128000,
            maxOutputTokens: 8192,
            maxInputTokens: 120000,
            supportsVision: true,
            supportsTools: true,
            supportsReasoning: false,
            supportsStructuredOutput: true,
            supportsTemperature: true,
            supportsStreaming: true,
            openWeights: true,
            knowledge: '2025-09',
            releaseDate: '2025-12-01',
            lastUpdated: '2026-02-28',
            status: undefined,
            inputModalities: ['text', 'image'],
            outputModalities: ['text'],
            pricing: {
              input: 0.28,
              output: 0.42,
              cacheRead: 0.028,
              cacheWrite: 0.056,
              currency: 'USD',
            },
          } as ModelSpec,
          {
            id: 'deepseek-reasoner',
            name: 'DeepSeek Reasoner',
            family: 'deepseek-thinking',
            contextWindow: 128000,
            maxOutputTokens: 64000,
            supportsTools: true,
            supportsReasoning: true,
            supportsTemperature: true,
            openWeights: true,
            interleaved: { field: 'reasoning_content' },
            pricing: {
              input: 0.28,
              output: 0.42,
              cacheRead: 0.028,
              reasoning: 0.84,
              currency: 'USD',
            },
          } as ModelSpec,
        ],
      },
    ];

    it('should save and load all new fields via saveFullData', () => {
      persistence.saveFullData(fullProviders, new Date().toISOString());

      const spec = persistence.getModelSpec('deepseek', 'deepseek-chat');
      expect(spec).not.toBeNull();
      expect(spec!.family).toBe('deepseek');
      expect(spec!.maxInputTokens).toBe(120000);
      expect(spec!.maxOutputTokens).toBe(8192);
      expect(spec!.supportsVision).toBe(true);
      expect(spec!.supportsReasoning).toBe(false);
      expect(spec!.supportsStructuredOutput).toBe(true);
      expect(spec!.supportsTemperature).toBe(true);
      expect(spec!.openWeights).toBe(true);
      expect(spec!.knowledge).toBe('2025-09');
      expect(spec!.releaseDate).toBe('2025-12-01');
      expect(spec!.lastUpdated).toBe('2026-02-28');
      expect(spec!.inputModalities).toEqual(['text', 'image']);
      expect(spec!.outputModalities).toEqual(['text']);
      expect(spec!.pricing).toBeDefined();
      expect(spec!.pricing!.input).toBe(0.28);
      expect(spec!.pricing!.output).toBe(0.42);
      expect(spec!.pricing!.cacheRead).toBe(0.028);
      expect(spec!.pricing!.cacheWrite).toBe(0.056);
      expect(spec!.status).toBeUndefined();
      expect(spec!.deprecated).toBeUndefined();
    });

    it('should save and load reasoning model with interleaved and reasoning cost', () => {
      persistence.saveFullData(fullProviders, new Date().toISOString());

      const spec = persistence.getModelSpec('deepseek', 'deepseek-reasoner');
      expect(spec).not.toBeNull();
      expect(spec!.supportsReasoning).toBe(true);
      expect(spec!.interleaved).toEqual({ field: 'reasoning_content' });
      expect(spec!.pricing!.reasoning).toBe(0.84);
    });

    it('should handle deprecated status', () => {
      const providersWithDeprecated: ModelsDevProvider[] = [
        {
          id: 'test',
          name: 'Test',
          baseUrl: 'https://test.com',
          envKeys: ['TEST_KEY'],
          npmPackage: '@ai-sdk/openai-compatible',
          type: 'openai-compatible',
          models: [
            {
              id: 'old-model',
              name: 'Old Model',
              contextWindow: 4096,
              status: 'deprecated' as const,
            } as ModelSpec,
          ],
        },
      ];

      persistence.saveFullData(providersWithDeprecated, new Date().toISOString());
      const spec = persistence.getModelSpec('test', 'old-model');
      expect(spec!.status).toBe('deprecated');
      expect(spec!.deprecated).toBe(true);
    });

    it('should migrate old schema by adding new columns', () => {
      // 模拟旧 schema：创建一个只有基础列的表
      persistence['db'].exec('DROP TABLE IF EXISTS models');
      persistence['db'].exec(`
        CREATE TABLE models (
          id TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          family TEXT,
          context_window INTEGER NOT NULL DEFAULT 4096,
          max_output_tokens INTEGER,
          supports_vision INTEGER NOT NULL DEFAULT 0,
          supports_tools INTEGER NOT NULL DEFAULT 1,
          supports_reasoning INTEGER DEFAULT 0,
          supports_streaming INTEGER NOT NULL DEFAULT 1,
          input_modalities TEXT,
          output_modalities TEXT,
          cost_input REAL DEFAULT 0,
          cost_output REAL DEFAULT 0,
          cost_cache_read REAL,
          PRIMARY KEY (id, provider_id)
        );
      `);

      // 创建一个新的 persistence 实例，触发迁移
      persistence['initSchema']();

      // 验证新列存在
      const columns = persistence['db'].prepare("PRAGMA table_info(models)").all() as Array<{ name: string }>;
      const columnNames = columns.map(c => c.name);
      expect(columnNames).toContain('max_input_tokens');
      expect(columnNames).toContain('supports_structured_output');
      expect(columnNames).toContain('open_weights');
      expect(columnNames).toContain('knowledge');
      expect(columnNames).toContain('release_date');
      expect(columnNames).toContain('last_updated');
      expect(columnNames).toContain('interleaved');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('cost_cache_write');
      expect(columnNames).toContain('cost_reasoning');
    });
  });
});
