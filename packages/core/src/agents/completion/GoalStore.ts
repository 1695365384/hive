/**
 * Per-session Goal persistence for completion discipline.
 *
 * Tracks the original user Goal across audit continues / blocked / user Continue,
 * so the Coordinator can resume the SAME task instead of treating Continue as a new chat.
 *
 * Optional GoalPersistence (SQLite) keeps incomplete Goals across process restarts.
 */

import type { TaskProgressEvent } from './types.js';

export type GoalStatus = 'active' | 'blocked' | 'done' | 'cancelled';

export interface GoalTodo {
  id: string;
  text: string;
  done: boolean;
}

export interface GoalRecord {
  sessionId: string;
  /** Original user task text (not continuation prompts) */
  goal: string;
  status: GoalStatus;
  todos: GoalTodo[];
  reasons: string[];
  /** Coordinator audit auto-continues already consumed this turn */
  auditAttempts: number;
  /** User / idle Continue resumes against the same Goal */
  continueAttempts: number;
  createdAt: number;
  updatedAt: number;
}

/** Optional durable backend for GoalStore (e.g. SQLite GoalRepository). */
export interface GoalPersistence {
  save(record: GoalRecord): void;
  delete(sessionId: string): void;
  loadIncomplete(): GoalRecord[];
}

export interface GoalStoreOptions {
  persistence?: GoalPersistence;
}

export class GoalStore {
  private goals = new Map<string, GoalRecord>();
  private persistence?: GoalPersistence;

  constructor(options?: GoalStoreOptions) {
    this.persistence = options?.persistence;
  }

  /** Attach / replace durable backend after DB is ready. */
  attachPersistence(persistence: GoalPersistence): void {
    this.persistence = persistence;
  }

  /** Load records into memory (typically incomplete Goals after restart). */
  hydrate(records: GoalRecord[]): void {
    for (const record of records) {
      this.goals.set(record.sessionId, { ...record, todos: [...record.todos], reasons: [...record.reasons] });
    }
  }

  get(sessionId: string): GoalRecord | undefined {
    return this.goals.get(sessionId);
  }

  /** Start or replace Goal for a fresh user message. */
  start(sessionId: string, goal: string): GoalRecord {
    const now = Date.now();
    const record: GoalRecord = {
      sessionId,
      goal: goal.trim(),
      status: 'active',
      todos: [],
      reasons: [],
      auditAttempts: 0,
      continueAttempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.goals.set(sessionId, record);
    this.persist(sessionId);
    return record;
  }

  /**
   * Ensure a Goal exists. If one is already incomplete, keep its text
   * (used when Continue injects a synthetic prompt).
   */
  ensure(sessionId: string, goal: string): GoalRecord {
    const existing = this.goals.get(sessionId);
    if (existing && (existing.status === 'active' || existing.status === 'blocked')) {
      existing.updatedAt = Date.now();
      if (existing.status === 'blocked') existing.status = 'active';
      this.goals.set(sessionId, existing);
      this.persist(sessionId);
      return existing;
    }
    return this.start(sessionId, goal);
  }

  markActive(sessionId: string): GoalRecord | undefined {
    const g = this.goals.get(sessionId);
    if (!g) return undefined;
    g.status = 'active';
    g.updatedAt = Date.now();
    this.persist(sessionId);
    return g;
  }

  markBlocked(sessionId: string, reasons: string[] = []): GoalRecord | undefined {
    const g = this.goals.get(sessionId);
    if (!g) return undefined;
    g.status = 'blocked';
    g.reasons = reasons.filter(Boolean);
    g.updatedAt = Date.now();
    this.persist(sessionId);
    return g;
  }

  markDone(sessionId: string): GoalRecord | undefined {
    const g = this.goals.get(sessionId);
    if (!g) return undefined;
    g.status = 'done';
    g.reasons = [];
    g.todos = g.todos.map((t) => ({ ...t, done: true }));
    g.updatedAt = Date.now();
    this.persist(sessionId);
    return g;
  }

  markCancelled(sessionId: string): GoalRecord | undefined {
    const g = this.goals.get(sessionId);
    if (!g) return undefined;
    g.status = 'cancelled';
    g.updatedAt = Date.now();
    this.persist(sessionId);
    return g;
  }

  bumpAuditAttempts(sessionId: string, n = 1): void {
    const g = this.goals.get(sessionId);
    if (!g) return;
    g.auditAttempts += n;
    g.updatedAt = Date.now();
    this.persist(sessionId);
  }

  bumpContinueAttempts(sessionId: string, n = 1): void {
    const g = this.goals.get(sessionId);
    if (!g) return;
    g.continueAttempts += n;
    g.updatedAt = Date.now();
    this.persist(sessionId);
  }

  setTodos(sessionId: string, todos: GoalTodo[]): void {
    const g = this.goals.get(sessionId);
    if (!g) return;
    g.todos = todos;
    g.updatedAt = Date.now();
    this.persist(sessionId);
  }

  /** Sync Goal status from streaming task-progress events. */
  updateFromProgress(sessionId: string, progress: TaskProgressEvent): void {
    if (progress.phase === 'blocked') {
      this.markBlocked(sessionId, progress.reasons ?? (progress.message ? [progress.message] : []));
      if (progress.attempt != null) {
        const g = this.goals.get(sessionId);
        if (g) {
          g.auditAttempts = Math.max(g.auditAttempts, progress.attempt);
          this.persist(sessionId);
        }
      }
      return;
    }
    if (progress.phase === 'done') {
      // Defensive: some paths emit done with a failure label — keep Goal resumable.
      const msg = progress.message ?? '';
      if (/失败|未完成|fail|error/i.test(msg)) {
        this.markBlocked(sessionId, progress.reasons ?? [msg]);
        return;
      }
      this.markDone(sessionId);
      return;
    }
    if (progress.phase === 'continue') {
      this.markActive(sessionId);
      if (progress.attempt != null) {
        const g = this.goals.get(sessionId);
        if (g) {
          g.auditAttempts = Math.max(g.auditAttempts, progress.attempt);
          this.persist(sessionId);
        }
      }
      return;
    }
    // understand / plan / execute / verify → keep active
    this.markActive(sessionId);
  }

  clear(sessionId: string): void {
    this.goals.delete(sessionId);
    this.persistence?.delete(sessionId);
  }

  /** Test helper */
  clearAll(): void {
    const ids = [...this.goals.keys()];
    this.goals.clear();
    for (const id of ids) {
      this.persistence?.delete(id);
    }
  }

  private persist(sessionId: string): void {
    if (!this.persistence) return;
    const g = this.goals.get(sessionId);
    if (!g) {
      this.persistence.delete(sessionId);
      return;
    }
    // Keep terminal Goals briefly for audit, then drop cancelled from disk when cleared.
    this.persistence.save({
      ...g,
      todos: [...g.todos],
      reasons: [...g.reasons],
    });
  }
}

export function createGoalStore(options?: GoalStoreOptions): GoalStore {
  return new GoalStore(options);
}
