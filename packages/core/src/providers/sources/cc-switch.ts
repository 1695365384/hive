/**
 * CC-Switch 配置来源
 *
 * 从 CC-Switch SQLite 数据库读取配置
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
import type { ConfigSource, ProviderConfig, McpServerConfig } from '../types.js';

/**
 * CC-Switch 数据库中的 Provider 记录
 */
interface CCProviderRecord {
  id: string;
  app_id: string;
  name: string;
  base_url: string;
  api_key: string;
  model?: string;
  is_active: number;
  config?: string;
}

/**
 * CC-Switch 数据库中的 MCP 服务器记录
 */
interface CCMcpServerRecord {
  id: string;
  name: string;
  command: string;
  args?: string;
  env?: string;
  enabled: number;
}

/**
 * CC-Switch 配置来源
 */
export class CCSwitchSource implements ConfigSource {
  readonly name = 'cc-switch';

  private dbPath: string;
  private available: boolean | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(homedir(), '.cc-switch', 'cc-switch.db');
  }

  isAvailable(): boolean {
    if (this.available !== null) return this.available;
    this.available = existsSync(this.dbPath);
    return this.available;
  }

  getProvider(id: string): ProviderConfig | null {
    if (!this.isAvailable()) return null;

    try {
      const Database = require('better-sqlite3');
      const db = new Database(this.dbPath, { readonly: true });

      const record = db.prepare(`
        SELECT * FROM providers
        WHERE id = ? OR name = ?
        LIMIT 1
      `).get(id, id) as CCProviderRecord | undefined;

      db.close();

      return record ? this.toProviderConfig(record) : null;
    } catch (error) {
      console.warn('CC-Switch 读取失败:', error);
      return null;
    }
  }

  getAllProviders(): ProviderConfig[] {
    if (!this.isAvailable()) return [];

    try {
      const Database = require('better-sqlite3');
      const db = new Database(this.dbPath, { readonly: true });

      const records = db.prepare(`
        SELECT * FROM providers
        WHERE app_id = 'claude-code'
        ORDER BY is_active DESC, name ASC
      `).all() as CCProviderRecord[];

      db.close();

      return records.map(r => this.toProviderConfig(r));
    } catch (error) {
      console.warn('CC-Switch 读取失败:', error);
      return [];
    }
  }

  getMcpServers(): Record<string, McpServerConfig> {
    if (!this.isAvailable()) return {};

    try {
      const Database = require('better-sqlite3');
      const db = new Database(this.dbPath, { readonly: true });

      const records = db.prepare(`
        SELECT * FROM mcp_servers
        WHERE app_id = 'claude-code' AND enabled = 1
      `).all() as CCMcpServerRecord[];

      db.close();

      const result: Record<string, McpServerConfig> = {};
      for (const record of records) {
        result[record.name] = {
          command: record.command,
          args: record.args ? JSON.parse(record.args) : undefined,
          env: record.env ? JSON.parse(record.env) : undefined,
          enabled: record.enabled === 1,
        };
      }

      return result;
    } catch (error) {
      console.warn('CC-Switch MCP 读取失败:', error);
      return {};
    }
  }

  getDefaultProviderId(): string | null {
    if (!this.isAvailable()) return null;

    try {
      const Database = require('better-sqlite3');
      const db = new Database(this.dbPath, { readonly: true });

      const record = db.prepare(`
        SELECT id FROM providers
        WHERE app_id = 'claude-code' AND is_active = 1
        LIMIT 1
      `).get() as { id: string } | undefined;

      db.close();

      return record?.id ?? null;
    } catch {
      return null;
    }
  }

  private toProviderConfig(record: CCProviderRecord): ProviderConfig {
    let extra: Record<string, unknown> | undefined;
    if (record.config) {
      try {
        extra = JSON.parse(record.config);
      } catch {
        // ignore
      }
    }

    return {
      id: record.id,
      name: record.name,
      baseUrl: record.base_url,
      apiKey: record.api_key,
      model: record.model,
      enabled: record.is_active === 1,
      extra,
    };
  }
}
