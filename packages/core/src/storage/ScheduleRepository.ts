/**
 * Schedule Repository
 *
 * 定时任务和执行记录的 CRUD 操作
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { safeJsonParse } from '../utils/safe-json-parse.js';
import type {
  Schedule,
  ScheduleRun,
  CreateScheduleInput,
  UpdateScheduleInput,
  IScheduleRepository,
  NotifyConfig,
  ScheduleKind,
} from '../scheduler/types.js';
import { getNextRunTime, isValidCron, computeNextRunAtMs } from '../scheduler/cron-utils.js';

interface ScheduleRow {
  id: string;
  name: string;
  cron: string;
  prompt: string;
  action: string;
  enabled: number;
  schedule_kind: string;
  interval_ms: number | null;
  run_at: string | null;
  delete_after_run: number;
  consecutive_errors: number;
  notify_config: string | null;
  source: string;
  auto_created_by: string | null;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  metadata: string | null;
}

interface ScheduleRunRow {
  id: string;
  schedule_id: string;
  session_id: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

/**
 * Schedule Repository Implementation
 */
export class ScheduleRepository implements IScheduleRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async create(input: CreateScheduleInput): Promise<Schedule> {
    const now = new Date();
    const id = randomUUID();
    const scheduleKind: ScheduleKind = input.scheduleKind ?? 'cron';
    const cron = input.cron ?? '';
    const nextRun = computeNextRunAtMs({
      scheduleKind,
      cron,
      intervalMs: input.intervalMs,
      runAt: input.runAt,
    });
    const nextRunAt = nextRun != null ? new Date(nextRun) : undefined;

    this.db.prepare(`
      INSERT INTO schedules (
        id, name, cron, prompt, action, enabled,
        schedule_kind, interval_ms, run_at, delete_after_run, consecutive_errors,
        notify_config, source, auto_created_by,
        created_at, updated_at, next_run_at, run_count
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      id,
      input.name,
      cron,
      input.prompt,
      input.action ?? 'chat',
      scheduleKind,
      input.intervalMs ?? null,
      input.runAt ?? null,
      input.deleteAfterRun ? 1 : 0,
      JSON.stringify(input.notifyConfig ?? null),
      input.source ?? 'user',
      input.autoCreatedBy ?? null,
      now.toISOString(),
      now.toISOString(),
      nextRunAt?.toISOString() ?? null,
    );

    return {
      id,
      name: input.name,
      cron,
      prompt: input.prompt,
      action: input.action ?? 'chat',
      enabled: true,
      scheduleKind,
      intervalMs: input.intervalMs,
      runAt: input.runAt,
      deleteAfterRun: input.deleteAfterRun ?? false,
      consecutiveErrors: 0,
      notifyConfig: input.notifyConfig,
      source: input.source ?? 'user',
      autoCreatedBy: input.autoCreatedBy,
      createdAt: now,
      updatedAt: now,
      nextRunAt,
      runCount: 0,
    };
  }

  async findAll(): Promise<Schedule[]> {
    const rows = this.db.prepare('SELECT * FROM schedules ORDER BY created_at DESC').all() as ScheduleRow[];
    return rows.map(this.rowToSchedule);
  }

  async findById(id: string): Promise<Schedule | null> {
    const row = this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as ScheduleRow | undefined;
    return row ? this.rowToSchedule(row) : null;
  }

  async findEnabled(): Promise<Schedule[]> {
    const rows = this.db.prepare('SELECT * FROM schedules WHERE enabled = 1 ORDER BY next_run_at ASC').all() as ScheduleRow[];
    return rows.map(this.rowToSchedule);
  }

  async update(id: string, input: UpdateScheduleInput): Promise<Schedule | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const now = new Date();
    const updates: string[] = [];
    const values: unknown[] = [];

    // Whitelist column mapping: input field → DB column
    const COLUMN_MAP: Record<string, string> = {
      name: 'name', prompt: 'prompt', action: 'action', cron: 'cron',
      enabled: 'enabled', scheduleKind: 'schedule_kind', intervalMs: 'interval_ms',
      runAt: 'run_at', deleteAfterRun: 'delete_after_run', consecutiveErrors: 'consecutive_errors',
      notifyConfig: 'notify_config', source: 'source',
    };

    for (const [field, column] of Object.entries(COLUMN_MAP)) {
      const value = (input as Record<string, unknown>)[field];
      if (value === undefined) continue;

      if (field === 'enabled' || field === 'deleteAfterRun') {
        updates.push(`${column} = ?`);
        values.push(value ? 1 : 0);
      } else if (field === 'notifyConfig') {
        updates.push(`${column} = ?`);
        values.push(JSON.stringify(value));
      } else {
        updates.push(`${column} = ?`);
        values.push(value);
      }

      // Special: cron change updates next_run_at
      if (field === 'cron') {
        const nextRun = getNextRunTime(value as string);
        updates.push('next_run_at = ?');
        values.push(nextRun?.toISOString() ?? null);
      }
    }

    updates.push('updated_at = ?');
    values.push(now.toISOString());

    values.push(id);

    this.db.prepare(`UPDATE schedules SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    return result.changes > 0;
  }

  async createRun(run: Omit<ScheduleRun, 'id'>): Promise<ScheduleRun> {
    const id = randomUUID();

    this.db.prepare(`
      INSERT INTO schedule_runs (id, schedule_id, session_id, status, started_at, completed_at, error)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      run.scheduleId,
      run.sessionId ?? null,
      run.status,
      run.startedAt.toISOString(),
      run.completedAt?.toISOString() ?? null,
      run.error ?? null,
    );

    // 更新 schedules 表的 last_run_at 和 run_count
    this.db.prepare(`
      UPDATE schedules SET last_run_at = ?, run_count = run_count + 1, updated_at = ? WHERE id = ?
    `).run(run.startedAt.toISOString(), new Date().toISOString(), run.scheduleId);

    return { id, ...run };
  }

  async updateRun(
    id: string,
    updates: Partial<Pick<ScheduleRun, 'status' | 'sessionId' | 'completedAt' | 'error'>>
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
    if (updates.sessionId !== undefined) { setClauses.push('session_id = ?'); values.push(updates.sessionId); }
    if (updates.completedAt !== undefined) { setClauses.push('completed_at = ?'); values.push(updates.completedAt.toISOString()); }
    if (updates.error !== undefined) { setClauses.push('error = ?'); values.push(updates.error); }

    if (setClauses.length === 0) return;

    values.push(id);
    this.db.prepare(`UPDATE schedule_runs SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

    // 如果执行完成，更新 next_run_at
    if (updates.status === 'success' || updates.status === 'failed') {
      const runRow = this.db.prepare('SELECT schedule_id FROM schedule_runs WHERE id = ?').get(id) as { schedule_id: string } | undefined;
      if (runRow) {
        const scheduleRow = this.db.prepare(
          'SELECT cron, schedule_kind, interval_ms, run_at FROM schedules WHERE id = ?'
        ).get(runRow.schedule_id) as { cron: string; schedule_kind: string; interval_ms: number | null; run_at: string | null } | undefined;
        if (scheduleRow) {
          const nextMs = computeNextRunAtMs({
            scheduleKind: scheduleRow.schedule_kind as ScheduleKind,
            cron: scheduleRow.cron,
            intervalMs: scheduleRow.interval_ms ?? undefined,
            runAt: scheduleRow.run_at ?? undefined,
          });
          const nextRun = nextMs != null ? new Date(nextMs) : null;
          this.db.prepare('UPDATE schedules SET next_run_at = ? WHERE id = ?').run(
            nextRun?.toISOString() ?? null,
            runRow.schedule_id,
          );
        }
      }
    }
  }

  async findRunsByScheduleId(scheduleId: string, limit: number = 50): Promise<ScheduleRun[]> {
    const rows = this.db.prepare(
      'SELECT * FROM schedule_runs WHERE schedule_id = ? ORDER BY started_at DESC LIMIT ?'
    ).all(scheduleId, limit) as ScheduleRunRow[];

    return rows.map(this.rowToRun);
  }

  private rowToSchedule(row: ScheduleRow): Schedule {
    return {
      id: row.id,
      name: row.name,
      cron: row.cron,
      prompt: row.prompt,
      action: row.action as Schedule['action'],
      enabled: row.enabled === 1,
      scheduleKind: (row.schedule_kind ?? 'cron') as ScheduleKind,
      intervalMs: row.interval_ms ?? undefined,
      runAt: row.run_at ?? undefined,
      deleteAfterRun: row.delete_after_run === 1,
      consecutiveErrors: row.consecutive_errors ?? 0,
      notifyConfig: row.notify_config ? safeJsonParse<NotifyConfig>(row.notify_config, null!) : undefined,
      source: (row.source ?? 'user') as Schedule['source'],
      autoCreatedBy: row.auto_created_by ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastRunAt: row.last_run_at ? new Date(row.last_run_at) : undefined,
      nextRunAt: row.next_run_at ? new Date(row.next_run_at) : undefined,
      runCount: row.run_count,
      metadata: safeJsonParse<Record<string, unknown>>(row.metadata ?? '{}', {}),
    };
  }

  private rowToRun(row: ScheduleRunRow): ScheduleRun {
    return {
      id: row.id,
      scheduleId: row.schedule_id,
      sessionId: row.session_id ?? undefined,
      status: row.status as ScheduleRun['status'],
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      error: row.error ?? undefined,
    };
  }
}

/**
 * Create schedule repository instance
 */
export function createScheduleRepository(db: Database.Database): ScheduleRepository {
  return new ScheduleRepository(db);
}
