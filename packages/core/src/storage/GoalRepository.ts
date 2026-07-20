/**
 * Goal Repository
 *
 * SQLite persistence for GoalStore records (completion discipline).
 */

import type Database from 'better-sqlite3';
import { safeJsonParse } from '../utils/safe-json-parse.js';
import type { GoalPersistence, GoalRecord, GoalStatus, GoalTodo } from '../agents/completion/GoalStore.js';

interface GoalRow {
  session_id: string;
  goal: string;
  status: string;
  todos: string;
  reasons: string;
  audit_attempts: number;
  continue_attempts: number;
  created_at: number;
  updated_at: number;
}

export interface IGoalRepository extends GoalPersistence {
  load(sessionId: string): GoalRecord | undefined;
  loadAll(): GoalRecord[];
}

export class GoalRepository implements IGoalRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  save(record: GoalRecord): void {
    this.db.prepare(`
      INSERT INTO goals (
        session_id, goal, status, todos, reasons,
        audit_attempts, continue_attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        goal = excluded.goal,
        status = excluded.status,
        todos = excluded.todos,
        reasons = excluded.reasons,
        audit_attempts = excluded.audit_attempts,
        continue_attempts = excluded.continue_attempts,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `).run(
      record.sessionId,
      record.goal,
      record.status,
      JSON.stringify(record.todos ?? []),
      JSON.stringify(record.reasons ?? []),
      record.auditAttempts,
      record.continueAttempts,
      record.createdAt,
      record.updatedAt,
    );
  }

  delete(sessionId: string): void {
    this.db.prepare('DELETE FROM goals WHERE session_id = ?').run(sessionId);
  }

  load(sessionId: string): GoalRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM goals WHERE session_id = ?')
      .get(sessionId) as GoalRow | undefined;
    return row ? this.rowToRecord(row) : undefined;
  }

  loadIncomplete(): GoalRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM goals WHERE status IN ('active', 'blocked') ORDER BY updated_at DESC`)
      .all() as GoalRow[];
    return rows.map((row) => this.rowToRecord(row));
  }

  loadAll(): GoalRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM goals ORDER BY updated_at DESC')
      .all() as GoalRow[];
    return rows.map((row) => this.rowToRecord(row));
  }

  private rowToRecord(row: GoalRow): GoalRecord {
    return {
      sessionId: row.session_id,
      goal: row.goal,
      status: row.status as GoalStatus,
      todos: safeJsonParse<GoalTodo[]>(row.todos ?? '[]', []),
      reasons: safeJsonParse<string[]>(row.reasons ?? '[]', []),
      auditAttempts: row.audit_attempts ?? 0,
      continueAttempts: row.continue_attempts ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export function createGoalRepository(db: Database.Database): GoalRepository {
  return new GoalRepository(db);
}
