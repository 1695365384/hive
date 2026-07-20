/**
 * Per-session Goal persistence for completion discipline.
 *
 * Tracks the original user Goal across audit continues / blocked / user Continue,
 * so the Coordinator can resume the SAME task instead of treating Continue as a new chat.
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

export class GoalStore {
  private goals = new Map<string, GoalRecord>();

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
      return existing;
    }
    return this.start(sessionId, goal);
  }

  markActive(sessionId: string): GoalRecord | undefined {
    const g = this.goals.get(sessionId);
    if (!g) return undefined;
    g.status = 'active';
    g.updatedAt = Date.now();
    return g;
  }

  markBlocked(sessionId: string, reasons: string[] = []): GoalRecord | undefined {
    const g = this.goals.get(sessionId);
    if (!g) return undefined;
    g.status = 'blocked';
    g.reasons = reasons.filter(Boolean);
    g.updatedAt = Date.now();
    return g;
  }

  markDone(sessionId: string): GoalRecord | undefined {
    const g = this.goals.get(sessionId);
    if (!g) return undefined;
    g.status = 'done';
    g.reasons = [];
    g.todos = g.todos.map((t) => ({ ...t, done: true }));
    g.updatedAt = Date.now();
    return g;
  }

  markCancelled(sessionId: string): GoalRecord | undefined {
    const g = this.goals.get(sessionId);
    if (!g) return undefined;
    g.status = 'cancelled';
    g.updatedAt = Date.now();
    return g;
  }

  bumpAuditAttempts(sessionId: string, n = 1): void {
    const g = this.goals.get(sessionId);
    if (!g) return;
    g.auditAttempts += n;
    g.updatedAt = Date.now();
  }

  bumpContinueAttempts(sessionId: string, n = 1): void {
    const g = this.goals.get(sessionId);
    if (!g) return;
    g.continueAttempts += n;
    g.updatedAt = Date.now();
  }

  setTodos(sessionId: string, todos: GoalTodo[]): void {
    const g = this.goals.get(sessionId);
    if (!g) return;
    g.todos = todos;
    g.updatedAt = Date.now();
  }

  /** Sync Goal status from streaming task-progress events. */
  updateFromProgress(sessionId: string, progress: TaskProgressEvent): void {
    if (progress.phase === 'blocked') {
      this.markBlocked(sessionId, progress.reasons ?? (progress.message ? [progress.message] : []));
      if (progress.attempt != null) {
        const g = this.goals.get(sessionId);
        if (g) g.auditAttempts = Math.max(g.auditAttempts, progress.attempt);
      }
      return;
    }
    if (progress.phase === 'done') {
      this.markDone(sessionId);
      return;
    }
    if (progress.phase === 'continue') {
      this.markActive(sessionId);
      if (progress.attempt != null) {
        const g = this.goals.get(sessionId);
        if (g) g.auditAttempts = Math.max(g.auditAttempts, progress.attempt);
      }
      return;
    }
    // understand / plan / execute / verify → keep active
    this.markActive(sessionId);
  }

  clear(sessionId: string): void {
    this.goals.delete(sessionId);
  }

  /** Test helper */
  clearAll(): void {
    this.goals.clear();
  }
}

export function createGoalStore(): GoalStore {
  return new GoalStore();
}
