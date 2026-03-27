/**
 * Memory Repository
 *
 * Provides CRUD operations for memory entries using SQLite.
 */

import type Database from 'better-sqlite3';
import type { MemoryRow } from './types.js';
import { safeJsonParse } from '../utils/safe-json-parse.js';

export interface MemoryEntry {
  key: string;
  value: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IMemoryRepository {
  set(key: string, entry: Omit<MemoryEntry, 'key'>): Promise<void>;
  get(key: string): Promise<MemoryEntry | null>;
  getAll(): Promise<Record<string, MemoryEntry>>;
  getByTag(tag: string): Promise<MemoryEntry[]>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
}

/**
 * Memory Repository Implementation
 */
export class MemoryRepository implements IMemoryRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Set memory entry (upsert)
   */
  async set(key: string, entry: Omit<MemoryEntry, 'key'>): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memories
        (key, value, tags, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?)
    `);

    // For new entries, use provided createdAt; for updates, preserve existing
    const existing = await this.get(key);
    const createdAt = existing?.createdAt ?? entry.createdAt;

    stmt.run(
      key,
      entry.value,
      JSON.stringify(entry.tags ?? []),
      createdAt.toISOString(),
      entry.updatedAt.toISOString()
    );
  }

  /**
   * Get memory entry by key
   */
  async get(key: string): Promise<MemoryEntry | null> {
    const row = this.db
      .prepare('SELECT * FROM memories WHERE key = ?')
      .get(key) as MemoryRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToEntry(row);
  }

  /**
   * Get all memory entries
   */
  async getAll(): Promise<Record<string, MemoryEntry>> {
    const rows = this.db
      .prepare('SELECT * FROM memories ORDER BY key')
      .all() as MemoryRow[];

    const result: Record<string, MemoryEntry> = {};
    for (const row of rows) {
      result[row.key] = this.rowToEntry(row);
    }

    return result;
  }

  /**
   * Get memories by tag (JSON contains query)
   */
  async getByTag(tag: string): Promise<MemoryEntry[]> {
    // SQLite JSON contains: check if tag exists in tags array
    const rows = this.db
      .prepare(`SELECT * FROM memories WHERE tags LIKE ? ORDER BY key`)
      .all(`%"${tag}"%`) as MemoryRow[];

    // Double-check with JSON parsing to avoid false positives
    return rows
      .map(row => this.rowToEntry(row))
      .filter(entry => entry.tags?.includes(tag));
  }

  /**
   * Delete memory by key
   */
  async delete(key: string): Promise<boolean> {
    const result = this.db
      .prepare('DELETE FROM memories WHERE key = ?')
      .run(key);

    return result.changes > 0;
  }

  /**
   * Clear all memories
   */
  async clear(): Promise<void> {
    this.db.exec('DELETE FROM memories');
  }

  /**
   * Convert database row to MemoryEntry
   */
  private rowToEntry(row: MemoryRow): MemoryEntry {
    return {
      key: row.key,
      value: row.value,
      tags: safeJsonParse<string[]>(row.tags ?? '[]', []),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

/**
 * Create memory repository instance
 */
export function createMemoryRepository(db: Database.Database): MemoryRepository {
  return new MemoryRepository(db);
}
