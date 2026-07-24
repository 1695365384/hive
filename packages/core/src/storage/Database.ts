/**
 * SQLite Database Manager
 *
 * Manages SQLite connection with WAL mode for concurrent reads.
 * Provides singleton connection per workspace.
 */

import BetterSqlite3 from 'better-sqlite3';
import { createRequire } from 'node:module';
import * as path from 'path';
import * as fs from 'fs';
import { MigrationRunner } from './MigrationRunner.js';

type SqliteDatabase = BetterSqlite3.Database;

const require = createRequire(import.meta.url);

/** Adapt bun:sqlite to the better-sqlite3 surface Hive storage uses. */
function openBunDatabase(dbPath: string): SqliteDatabase {
  // bun:sqlite is only resolvable under Bun.
  const { Database } = require('bun:sqlite') as {
    Database: new (filename: string, options?: { create?: boolean }) => {
      prepare(sql: string): BetterSqlite3.Statement;
      exec(sql: string): unknown;
      transaction<T extends unknown[]>(fn: (...args: T) => unknown): (...args: T) => unknown;
      close(): void;
      query(sql: string): { all: (...params: unknown[]) => unknown[]; get: (...params: unknown[]) => unknown };
    };
  };
  const raw = new Database(dbPath, { create: true });
  const adapted = {
    prepare: (sql: string) => raw.prepare(sql),
    exec: (sql: string) => {
      raw.exec(sql);
    },
    transaction: <T extends unknown[]>(fn: (...args: T) => unknown) => raw.transaction(fn),
    close: () => raw.close(),
    pragma: (statement: string) => {
      const sql = `PRAGMA ${statement}`;
      try {
        return raw.query(sql).all();
      } catch {
        raw.exec(sql);
        return undefined;
      }
    },
  };
  return adapted as unknown as SqliteDatabase;
}

// Import migrations to register them
import './migrations/index.js';

export interface DatabaseConfig {
  /** Database file path (default: .hive/hive.db) */
  dbPath?: string;
  /** Enable WAL mode (default: true) */
  walMode?: boolean;
  /** Busy timeout in ms (default: 5000) */
  busyTimeout?: number;
}

/**
 * SQLite Database Manager
 */
export class DatabaseManager {
  private db: SqliteDatabase | null = null;
  private config: Required<DatabaseConfig>;
  private static instances: Map<string, DatabaseManager> = new Map();

  private constructor(config: Required<DatabaseConfig>) {
    this.config = config;
  }

  /**
   * Get or create database instance for a workspace
   */
  static getInstance(config?: DatabaseConfig): DatabaseManager {
    const dbPath = config?.dbPath ?? path.join(process.cwd(), '.hive', 'hive.db');

    if (!this.instances.has(dbPath)) {
      this.instances.set(dbPath, new DatabaseManager({
        dbPath,
        walMode: config?.walMode ?? true,
        busyTimeout: config?.busyTimeout ?? 5000,
      }));
    }

    return this.instances.get(dbPath)!;
  }

  /**
   * Get database connection (lazy initialization)
   */
  getDb(): SqliteDatabase {
    if (!this.db) {
      this.db = this.openConnection();
    }
    return this.db;
  }

  /**
   * Open database connection with WAL mode
   */
  private openConnection(): SqliteDatabase {
    const dbDir = path.dirname(this.config.dbPath);

    // Ensure directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = process.versions.bun
      ? openBunDatabase(this.config.dbPath)
      : new BetterSqlite3(this.config.dbPath);

    // Enable WAL mode for concurrent reads
    if (this.config.walMode) {
      db.pragma('journal_mode = WAL');
    }

    // Set synchronous mode (NORMAL is safe with WAL)
    db.pragma('synchronous = NORMAL');

    // Set busy timeout for concurrent access
    db.pragma(`busy_timeout = ${this.config.busyTimeout}`);

    // Enable foreign keys
    db.pragma('foreign_keys = ON');

    return db;
  }

  /**
   * Initialize database with migrations
   */
  async initialize(): Promise<void> {
    const db = this.getDb();
    const runner = new MigrationRunner(db);
    await runner.runPending();
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      // Checkpoint WAL before closing
      try {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        // Ignore checkpoint errors
      }
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Get database path
   */
  getPath(): string {
    return this.config.dbPath;
  }

  /**
   * Check if database file exists
   */
  exists(): boolean {
    return fs.existsSync(this.config.dbPath);
  }

  /**
   * Execute a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.getDb().transaction(fn)();
  }

  /**
   * Execute SQL (returns this for chaining)
   */
  exec(sql: string): this {
    this.getDb().exec(sql);
    return this;
  }

  /**
   * Prepare a statement
   */
  prepare(sql: string): BetterSqlite3.Statement {
    return this.getDb().prepare(sql);
  }

  /**
   * Close all instances (for cleanup)
   */
  static closeAll(): void {
    for (const instance of this.instances.values()) {
      instance.close();
    }
    this.instances.clear();
  }

  /**
   * Reset all instances (for test isolation)
   */
  static resetInstances(): void {
    for (const instance of this.instances.values()) {
      instance.close();
    }
    this.instances.clear();
  }
}

/**
 * Create database manager instance
 */
export function createDatabase(config?: DatabaseConfig): DatabaseManager {
  return DatabaseManager.getInstance(config);
}
