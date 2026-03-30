/**
 * Models.dev SQLite 持久化适配器
 *
 * 使用 better-sqlite3 存储 models.dev 缓存数据
 */

import Database from 'better-sqlite3';
import type DatabaseType from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { ModelsDevPersistence } from './models-dev.js';
import type { ModelsDevCache } from './types.js';
import type { ModelSpec, ModelsDevProvider } from '../types.js';
import type { ProviderInfo } from './provider-registry.js';

/**
 * SQLite 持久化实现
 *
 * 实现 ModelsDevPersistence 接口（load/save），并新增直接查询方法。
 * 内部维护一份完整的 ModelsDevProvider[] 缓存，绕过 CachedModelInfo 的信息丢失问题。
 */
export class SqlitePersistence implements ModelsDevPersistence {
  private db: DatabaseType.Database;
  private readonly dbPath: string;
  private static readonly CACHE_TTL_MS = 86400000; // 24 小时

  constructor(dbPath: string, db: DatabaseType.Database) {
    this.dbPath = dbPath;
    this.db = db;
    this.initSchema();
  }

  /**
   * 初始化数据库 schema
   */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'openai-compatible',
        env_keys TEXT NOT NULL DEFAULT '[]',
        npm_package TEXT NOT NULL DEFAULT '',
        default_model TEXT NOT NULL DEFAULT '',
        logo TEXT,
        fetched_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS models (
        id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        family TEXT,
        context_window INTEGER NOT NULL DEFAULT 4096,
        max_input_tokens INTEGER,
        max_output_tokens INTEGER,
        supports_vision INTEGER NOT NULL DEFAULT 0,
        supports_tools INTEGER NOT NULL DEFAULT 1,
        supports_reasoning INTEGER DEFAULT 0,
        supports_streaming INTEGER NOT NULL DEFAULT 1,
        supports_structured_output INTEGER DEFAULT 0,
        supports_temperature INTEGER DEFAULT 1,
        open_weights INTEGER DEFAULT 0,
        knowledge TEXT,
        release_date TEXT,
        last_updated TEXT,
        interleaved TEXT,
        status TEXT,
        input_modalities TEXT,
        output_modalities TEXT,
        cost_input REAL DEFAULT 0,
        cost_output REAL DEFAULT 0,
        cost_cache_read REAL,
        cost_cache_write REAL,
        cost_reasoning REAL,
        cost_input_audio REAL,
        cost_output_audio REAL,
        cost_context_over_200k REAL,
        PRIMARY KEY (id, provider_id),
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);
    `);

    // 增量迁移：为旧数据库添加新列
    this.migrateSchema();
  }

  /**
   * 增量迁移：为旧 schema 添加缺失的列
   */
  private migrateSchema(): void {
    const columns = this.db.prepare("PRAGMA table_info(models)").all() as Array<{ name: string }>;
    const existingColumns = new Set(columns.map(c => c.name));

    const migrations: Array<[string, string]> = [
      ['max_input_tokens', 'INTEGER'],
      ['supports_structured_output', 'INTEGER DEFAULT 0'],
      ['supports_temperature', 'INTEGER DEFAULT 1'],
      ['open_weights', 'INTEGER DEFAULT 0'],
      ['knowledge', 'TEXT'],
      ['release_date', 'TEXT'],
      ['last_updated', 'TEXT'],
      ['interleaved', 'TEXT'],
      ['status', 'TEXT'],
      ['cost_cache_write', 'REAL'],
      ['cost_reasoning', 'REAL'],
      ['cost_input_audio', 'REAL'],
      ['cost_output_audio', 'REAL'],
      ['cost_context_over_200k', 'REAL'],
    ];

    for (const [col, type] of migrations) {
      if (!existingColumns.has(col)) {
        this.db.exec(`ALTER TABLE models ADD COLUMN ${col} ${type}`);
      }
    }
  }

  // ============================================
  // ModelsDevPersistence 接口实现
  // ============================================

  /**
   * 从 SQLite 加载缓存（ModelsDevPersistence 接口）
   *
   * 供 ModelsDevClient.loadFromCache() 调用
   */
  async load(): Promise<ModelsDevCache | null> {
    try {
      const meta = this.db.prepare(
        'SELECT MAX(fetched_at) as fetched_at FROM providers'
      ).get() as { fetched_at: string | null } | undefined;

      if (!meta?.fetched_at) return null;

      const fetchedTime = new Date(meta.fetched_at).getTime();
      if (Date.now() - fetchedTime > SqlitePersistence.CACHE_TTL_MS) {
        return null;
      }

      // 从 SQLite 直接构建 ModelsDevCache
      const providers = this.loadProvidersFromDb();
      if (providers.length === 0) return null;

      return {
        version: '1.0.0',
        fetchedAt: meta.fetched_at,
        expiresAt: new Date(fetchedTime + SqlitePersistence.CACHE_TTL_MS).toISOString(),
        providers: providers.map(p => ({
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
          type: p.type,
          envKeys: p.envKeys,
          npmPackage: p.npmPackage,
          logo: p.logo,
          models: p.models.map(m => ({
            id: m.id,
            name: m.name ?? m.id,
            contextWindow: m.contextWindow,
            maxOutputTokens: m.maxOutputTokens,
            supportsVision: m.supportsVision,
            supportsTools: m.supportsTools,
          })),
        })),
      };
    } catch {
      return null;
    }
  }

  /**
   * 保存缓存到 SQLite（ModelsDevPersistence 接口）
   *
   * 供 ModelsDevClient.saveToCache() 调用。
   * ModelsDevCache 中的模型信息是简化版（CachedModelInfo），
   * 如果 SQLite 中已有该模型的完整数据，保留不变。
   */
  async save(cache: ModelsDevCache): Promise<void> {
    const transaction = this.db.transaction(() => {
      const now = new Date().toISOString();

      for (const provider of cache.providers) {
        // upsert provider
        this.db.prepare(`
          INSERT INTO providers (id, name, base_url, type, env_keys, npm_package, default_model, logo, fetched_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            base_url = excluded.base_url,
            type = excluded.type,
            env_keys = excluded.env_keys,
            npm_package = excluded.npm_package,
            default_model = excluded.default_model,
            logo = COALESCE(excluded.logo, providers.logo),
            fetched_at = excluded.fetched_at,
            updated_at = excluded.updated_at
        `).run(
          provider.id,
          provider.name,
          provider.baseUrl,
          provider.type,
          JSON.stringify(provider.envKeys),
          provider.npmPackage,
          provider.models[0]?.id ?? '',
          provider.logo ?? null,
          cache.fetchedAt,
          now,
        );

        // upsert models（只写入 CachedModelInfo 有的字段，不覆盖已有数据）
        const upsertModel = this.db.prepare(`
          INSERT INTO models (
            id, provider_id, name, context_window, max_output_tokens,
            supports_vision, supports_tools
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id, provider_id) DO UPDATE SET
            name = COALESCE(NULLIF(excluded.name, ''), models.name),
            context_window = COALESCE(NULLIF(excluded.context_window, 0), models.context_window),
            max_output_tokens = COALESCE(excluded.max_output_tokens, models.max_output_tokens),
            supports_vision = COALESCE(excluded.supports_vision, models.supports_vision),
            supports_tools = COALESCE(excluded.supports_tools, models.supports_tools)
        `);

        for (const model of provider.models) {
          upsertModel.run(
            model.id,
            provider.id,
            model.name ?? model.id,
            model.contextWindow,
            model.maxOutputTokens ?? null,
            model.supportsVision ? 1 : 0,
            model.supportsTools !== false ? 1 : 0,
          );
        }
      }
    });

    try {
      transaction();
    } catch (error) {
      throw new Error(`SQLite save failed: ${error}`);
    }
  }

  // ============================================
  // 直接写入完整数据（供 ProviderRegistry 调用）
  // ============================================

  /**
   * 直接写入完整的 ModelsDevProvider[] 数据
   *
   * 保留 models.dev 返回的所有字段（family, cost, modalities, reasoning 等），
   * 不经过 CachedModelInfo 的信息丢失。
   */
  saveFullData(providers: ModelsDevProvider[], fetchedAt: string): void {
    const transaction = this.db.transaction(() => {
      const now = new Date().toISOString();

      // 清除旧数据
      this.db.prepare('DELETE FROM models').run();
      this.db.prepare('DELETE FROM providers').run();

      const insertProvider = this.db.prepare(`
        INSERT INTO providers (id, name, base_url, type, env_keys, npm_package, default_model, logo, fetched_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertModel = this.db.prepare(`
        INSERT INTO models (
          id, provider_id, name, family, context_window, max_input_tokens, max_output_tokens,
          supports_vision, supports_tools, supports_reasoning, supports_streaming,
          supports_structured_output, supports_temperature, open_weights,
          knowledge, release_date, last_updated, interleaved, status,
          input_modalities, output_modalities,
          cost_input, cost_output, cost_cache_read, cost_cache_write,
          cost_reasoning, cost_input_audio, cost_output_audio, cost_context_over_200k
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const provider of providers) {
        insertProvider.run(
          provider.id,
          provider.name,
          provider.baseUrl,
          provider.type,
          JSON.stringify(provider.envKeys),
          provider.npmPackage,
          provider.models[0]?.id ?? '',
          provider.logo ?? null,
          fetchedAt,
          now,
        );

        for (const model of provider.models) {
          insertModel.run(
            model.id,
            provider.id,
            model.name ?? model.id,
            model.family ?? null,
            model.contextWindow,
            model.maxInputTokens ?? null,
            model.maxOutputTokens ?? null,
            model.supportsVision ? 1 : 0,
            model.supportsTools ? 1 : 0,
            model.supportsReasoning ? 1 : 0,
            model.supportsStreaming ? 1 : 0,
            model.supportsStructuredOutput ? 1 : 0,
            model.supportsTemperature !== false ? 1 : 0,
            model.openWeights ? 1 : 0,
            model.knowledge ?? null,
            model.releaseDate ?? null,
            model.lastUpdated ?? null,
            model.interleaved ? JSON.stringify(model.interleaved) : null,
            model.status ?? null,
            model.inputModalities ? JSON.stringify(model.inputModalities) : null,
            model.outputModalities ? JSON.stringify(model.outputModalities) : null,
            model.pricing?.input ?? 0,
            model.pricing?.output ?? 0,
            model.pricing?.cacheRead ?? null,
            model.pricing?.cacheWrite ?? null,
            model.pricing?.reasoning ?? null,
            model.pricing?.inputAudio ?? null,
            model.pricing?.outputAudio ?? null,
            model.pricing?.contextOver200k ?? null,
          );
        }
      }
    });

    try {
      transaction();
    } catch (error) {
      throw new Error(`SQLite saveFullData failed: ${error}`);
    }
  }

  // ============================================
  // 直接查询方法
  // ============================================

  /**
   * 快速查询 ModelSpec
   *
   * 直接通过 SQL 查询单个模型信息，无需全量加载
   */
  getModelSpec(providerId: string, modelId: string): ModelSpec | null {
    try {
      const row = this.db.prepare(
        `SELECT m.*, p.type as provider_type
         FROM models m
         JOIN providers p ON m.provider_id = p.id
         WHERE m.provider_id = ? AND m.id = ?`
      ).get(providerId.toLowerCase(), modelId) as Record<string, unknown> | undefined;

      if (!row) return null;
      return this.rowToModelSpec(row);
    } catch {
      return null;
    }
  }

  /**
   * 快速查询 ProviderInfo
   *
   * 直接通过 SQL 查询单个 provider 信息
   */
  getProviderInfo(providerId: string): ProviderInfo | null {
    try {
      const row = this.db.prepare(
        'SELECT * FROM providers WHERE id = ?'
      ).get(providerId.toLowerCase()) as {
        id: string;
        name: string;
        base_url: string;
        type: string;
        env_keys: string;
        npm_package: string;
        default_model: string;
        logo: string | null;
      } | undefined;

      if (!row) return null;

      return {
        providerId: row.id,
        name: row.name,
        baseUrl: row.base_url,
        defaultModel: row.default_model,
        type: row.type as ProviderInfo['type'],
        envKeys: JSON.parse(row.env_keys) as string[],
        npmPackage: row.npm_package,
        logo: row.logo ?? undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * 检查数据库是否有有效数据
   */
  hasValidData(): boolean {
    try {
      const meta = this.db.prepare(
        'SELECT MAX(fetched_at) as fetched_at FROM providers'
      ).get() as { fetched_at: string | null } | undefined;

      if (!meta?.fetched_at) return false;
      return Date.now() - new Date(meta.fetched_at).getTime() <= SqlitePersistence.CACHE_TTL_MS;
    } catch {
      return false;
    }
  }

  // ============================================
  // 内部辅助
  // ============================================

  /**
   * 从 SQLite 加载完整的 ModelsDevProvider[]（含所有字段）
   */
  private loadProvidersFromDb(): ModelsDevProvider[] {
    const providerRows = this.db.prepare(
      'SELECT * FROM providers ORDER BY id'
    ).all() as Array<{
      id: string;
      name: string;
      base_url: string;
      type: string;
      env_keys: string;
      npm_package: string;
      default_model: string;
      logo: string | null;
    }>;

    if (providerRows.length === 0) return [];

    return providerRows.map(p => ({
      id: p.id,
      name: p.name,
      baseUrl: p.base_url,
      envKeys: JSON.parse(p.env_keys) as string[],
      npmPackage: p.npm_package,
      logo: p.logo ?? undefined,
      type: p.type as ModelsDevProvider['type'],
      models: this.loadModelsForProvider(p.id),
    }));
  }

  /**
   * 从 SQLite 加载指定 provider 的完整模型列表
   */
  private loadModelsForProvider(providerId: string): ModelSpec[] {
    const rows = this.db.prepare(
      `SELECT * FROM models WHERE provider_id = ?`
    ).all(providerId) as Array<Record<string, unknown>>;

    return rows.map(row => this.rowToModelSpec(row));
  }

  /**
   * 将数据库行转换为 ModelSpec
   */
  private rowToModelSpec(row: Record<string, unknown>): ModelSpec {
    const spec: ModelSpec = {
      id: row.id as string,
      name: (row.name as string) || undefined,
      family: (row.family as string) || undefined,
      contextWindow: (row.context_window as number) || 4096,
      maxInputTokens: (row.max_input_tokens as number) || undefined,
      maxOutputTokens: (row.max_output_tokens as number) || undefined,
      supportsVision: (row.supports_vision as number) === 1,
      supportsTools: (row.supports_tools as number) === 1,
      supportsReasoning: (row.supports_reasoning as number) === 1,
      supportsStreaming: (row.supports_streaming as number) !== 0,
      supportsStructuredOutput: (row.supports_structured_output as number) === 1,
      supportsTemperature: (row.supports_temperature as number) !== 0,
      openWeights: (row.open_weights as number) === 1,
    };

    // 文本字段
    if (row.knowledge) spec.knowledge = row.knowledge as string;
    if (row.release_date) spec.releaseDate = row.release_date as string;
    if (row.last_updated) spec.lastUpdated = row.last_updated as string;
    if (row.status) spec.status = row.status as ModelSpec['status'];
    if (row.status === 'deprecated') spec.deprecated = true;

    // JSON 字段
    if (row.interleaved) {
      try { spec.interleaved = JSON.parse(row.interleaved as string); } catch { /* ignore */ }
    }
    if (row.input_modalities) {
      try { spec.inputModalities = JSON.parse(row.input_modalities as string); } catch { /* ignore */ }
    }
    if (row.output_modalities) {
      try { spec.outputModalities = JSON.parse(row.output_modalities as string); } catch { /* ignore */ }
    }

    // 定价
    const costInput = row.cost_input as number | null;
    const costOutput = row.cost_output as number | null;
    if (costInput !== null && costOutput !== null && (costInput > 0 || costOutput > 0)) {
      spec.pricing = {
        input: costInput,
        output: costOutput,
        currency: 'USD',
        ...(row.cost_cache_read != null ? { cacheRead: row.cost_cache_read as number } : {}),
        ...(row.cost_cache_write != null ? { cacheWrite: row.cost_cache_write as number } : {}),
        ...(row.cost_reasoning != null ? { reasoning: row.cost_reasoning as number } : {}),
        ...(row.cost_input_audio != null ? { inputAudio: row.cost_input_audio as number } : {}),
        ...(row.cost_output_audio != null ? { outputAudio: row.cost_output_audio as number } : {}),
        ...(row.cost_context_over_200k != null ? { contextOver200k: row.cost_context_over_200k as number } : {}),
      };
    }

    return spec;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
  }

  /**
   * 获取数据库路径
   */
  getDbPath(): string {
    return this.dbPath;
  }
}

/**
 * 创建 SQLite 持久化实例
 */
export function createSqlitePersistence(dbPath: string): SqlitePersistence {
  // 确保父目录存在
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return new SqlitePersistence(dbPath, db);
}
