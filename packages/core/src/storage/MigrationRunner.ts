/**
 * Migration Runner
 *
 * Manages schema version tracking and migration execution.
 */

import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: string;
  down?: string;
}

/**
 * Migration Runner
 */
export class MigrationRunner {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create migrations tracking table
   */
  private ensureMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  /**
   * Get current schema version
   */
  getCurrentVersion(): number {
    this.ensureMigrationsTable();

    const row = this.db
      .prepare('SELECT MAX(version) as version FROM _migrations')
      .get() as { version: number | null } | undefined;

    return row?.version ?? 0;
  }

  /**
   * Get applied migrations
   */
  getAppliedMigrations(): Array<{ version: number; name: string; applied_at: string }> {
    this.ensureMigrationsTable();

    return this.db
      .prepare('SELECT version, name, applied_at FROM _migrations ORDER BY version')
      .all() as Array<{ version: number; name: string; applied_at: string }>;
  }

  /**
   * Run a single migration in a transaction
   */
  async runMigration(migration: Migration): Promise<void> {
    const run = this.db.transaction(() => {
      // Execute migration SQL
      this.db.exec(migration.up);

      // Record migration
      this.db
        .prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)')
        .run(migration.version, migration.name);
    });

    run();
  }

  /**
   * Rollback a single migration
   */
  async rollbackMigration(migration: Migration): Promise<void> {
    if (!migration.down) {
      throw new Error(`Migration ${migration.version} (${migration.name}) has no down script`);
    }

    const downSql = migration.down; // Capture for closure
    const run = this.db.transaction(() => {
      // Execute rollback SQL
      this.db.exec(downSql);

      // Remove migration record
      this.db
        .prepare('DELETE FROM _migrations WHERE version = ?')
        .run(migration.version);
    });

    run();
  }

  /**
   * Run all pending migrations
   */
  async runPending(): Promise<number> {
    this.ensureMigrationsTable();

    const currentVersion = this.getCurrentVersion();
    const migrations = this.getMigrations();

    let applied = 0;
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        try {
          await this.runMigration(migration);
          applied++;
        } catch (err: unknown) {
          // Skip if migration was already applied (concurrent access / shared DB)
          if (err instanceof Error && (
            err.message.includes('UNIQUE constraint failed') ||
            err.message.includes('duplicate column name')
          )) {
            continue;
          }
          throw err;
        }
      }
    }

    return applied;
  }

  /**
   * Get all registered migrations
   */
  private getMigrations(): Migration[] {
    // Migrations are registered via the migrations/index.ts
    // This will be populated by the migration files
    return REGISTERED_MIGRATIONS;
  }
}

/**
 * Registered migrations (populated by migrations/index.ts)
 */
export const REGISTERED_MIGRATIONS: Migration[] = [];

/**
 * Register a migration
 */
export function registerMigration(migration: Migration): void {
  const existing = REGISTERED_MIGRATIONS.find(m => m.version === migration.version);
  if (existing) {
    return; // Already registered, skip (idempotent)
  }
  REGISTERED_MIGRATIONS.push(migration);
  REGISTERED_MIGRATIONS.sort((a, b) => a.version - b.version);
}
