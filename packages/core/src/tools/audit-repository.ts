/**
 * SQLite 审计日志存储库实现
 *
 * 负责持久化和查询审计日志条目
 * 支持查询、统计和清理操作
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { IAuditLogRepository, AuditLogEntry, AuditLogQuery, AuditLogStats } from './audit-types.js';

/**
 * 创建审计日志表的 SQL 迁移
 */
export const AUDIT_LOG_MIGRATION_UP = `
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    agent_id TEXT,
    user_id TEXT,
    tool_name TEXT NOT NULL,
    tool_permission TEXT NOT NULL CHECK(tool_permission IN ('safe', 'restricted', 'dangerous')),
    tool_input TEXT,
    tool_output TEXT,
    decision TEXT NOT NULL CHECK(decision IN ('allowed', 'denied', 'user_confirmed')),
    decision_reason TEXT,
    confirmation_prompt TEXT,
    user_confirmed_at TEXT,
    execution_status TEXT CHECK(execution_status IN ('success', 'failed', 'blocked')),
    execution_error TEXT,
    duration_ms INTEGER,
    cost_impact REAL,
    workflow_phase TEXT,
    task_id TEXT,
    remarks TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_tool_name (tool_name),
    INDEX idx_tool_permission (tool_permission),
    INDEX idx_decision (decision),
    INDEX idx_timestamp (timestamp)
  );

  CREATE TABLE IF NOT EXISTS audit_stats_cache (
    session_id TEXT PRIMARY KEY,
    total_actions INTEGER DEFAULT 0,
    safe_count INTEGER DEFAULT 0,
    restricted_count INTEGER DEFAULT 0,
    dangerous_count INTEGER DEFAULT 0,
    denied_count INTEGER DEFAULT 0,
    user_confirmed_count INTEGER DEFAULT 0,
    total_cost_impact REAL DEFAULT 0,
    avg_execution_duration_ms REAL DEFAULT 0,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

/**
 * 返回 SQLite 审计日志存储库实现
 */
export function createSqliteAuditLogRepository(db: Database.Database): IAuditLogRepository {
  // 执行迁移 - 分别执行每个 SQL 语句
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      agent_id TEXT,
      user_id TEXT,
      tool_name TEXT NOT NULL,
      tool_permission TEXT NOT NULL CHECK(tool_permission IN ('safe', 'restricted', 'dangerous')),
      tool_input TEXT,
      tool_output TEXT,
      decision TEXT NOT NULL CHECK(decision IN ('allowed', 'denied', 'user_confirmed')),
      decision_reason TEXT,
      confirmation_prompt TEXT,
      user_confirmed_at TEXT,
      execution_status TEXT CHECK(execution_status IN ('success', 'failed', 'blocked')),
      execution_error TEXT,
      duration_ms INTEGER,
      cost_impact REAL,
      workflow_phase TEXT,
      task_id TEXT,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_session_id ON audit_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_tool_name ON audit_logs(tool_name);
    CREATE INDEX IF NOT EXISTS idx_tool_permission ON audit_logs(tool_permission);
    CREATE INDEX IF NOT EXISTS idx_decision ON audit_logs(decision);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON audit_logs(timestamp);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_stats_cache (
      session_id TEXT PRIMARY KEY,
      total_actions INTEGER DEFAULT 0,
      safe_count INTEGER DEFAULT 0,
      restricted_count INTEGER DEFAULT 0,
      dangerous_count INTEGER DEFAULT 0,
      denied_count INTEGER DEFAULT 0,
      user_confirmed_count INTEGER DEFAULT 0,
      total_cost_impact REAL DEFAULT 0,
      avg_execution_duration_ms REAL DEFAULT 0,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return {
    /**
     * 保存审计日志条目
     */
    async save(entry: AuditLogEntry): Promise<void> {
      const stmt = db.prepare(`
        INSERT INTO audit_logs (
          id,
          session_id,
          timestamp,
          agent_id,
          user_id,
          tool_name,
          tool_permission,
          tool_input,
          tool_output,
          decision,
          decision_reason,
          confirmation_prompt,
          user_confirmed_at,
          execution_status,
          execution_error,
          duration_ms,
          cost_impact,
          workflow_phase,
          task_id,
          remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const id = entry.id || randomUUID();
      stmt.run(
        id,
        entry.sessionId,
        entry.timestamp.toISOString(),
        entry.agentId || null,
        entry.userId || null,
        entry.toolName,
        entry.toolPermission,
        entry.toolInput,
        entry.toolOutput || null,
        entry.decision,
        entry.decisionReason || null,
        entry.confirmationPrompt || null,
        entry.userConfirmedAt ? entry.userConfirmedAt.toISOString() : null,
        entry.executionStatus,
        entry.executionError || null,
        entry.durationMs || null,
        entry.costImpact || null,
        entry.workflowPhase || null,
        entry.taskId || null,
        entry.remarks || null
      );

      // 更新统计缓存
      updateStatsCache(db, entry.sessionId);
    },

    /**
     * 查询审计日志条目
     */
    async query(conditions: AuditLogQuery): Promise<AuditLogEntry[]> {
      let query = 'SELECT * FROM audit_logs WHERE 1 = 1';
      const values: (string | number | null)[] = [];

      if (conditions.sessionId) {
        query += ' AND session_id = ?';
        values.push(conditions.sessionId);
      }

      if (conditions.toolPermission) {
        query += ' AND tool_permission = ?';
        values.push(conditions.toolPermission);
      }

      if (conditions.decision) {
        query += ' AND decision = ?';
        values.push(conditions.decision);
      }

      if (conditions.executionStatus) {
        query += ' AND execution_status = ?';
        values.push(conditions.executionStatus);
      }

      if (conditions.startTime) {
        query += ' AND timestamp >= ?';
        values.push(conditions.startTime.toISOString());
      }

      if (conditions.endTime) {
        query += ' AND timestamp <= ?';
        values.push(conditions.endTime.toISOString());
      }

      if (conditions.toolNameSearch) {
        query += ' AND tool_name LIKE ?';
        values.push(`%${conditions.toolNameSearch}%`);
      }

      // 排序（默认按时间戳倒序）
      query += ' ORDER BY timestamp DESC';

      if (conditions.limit) {
        query += ' LIMIT ?';
        values.push(conditions.limit);
      }

      if (conditions.offset) {
        query += ' OFFSET ?';
        values.push(conditions.offset);
      }

      const stmt = db.prepare(query);
      const rows = stmt.all(...values) as any[];

      return rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        timestamp: new Date(row.timestamp),
        agentId: row.agent_id,
        userId: row.user_id,
        toolName: row.tool_name,
        toolPermission: row.tool_permission as 'safe' | 'restricted' | 'dangerous',
        toolInput: row.tool_input,
        toolOutput: row.tool_output,
        decision: row.decision as 'allowed' | 'denied' | 'user_confirmed',
        decisionReason: row.decision_reason,
        confirmationPrompt: row.confirmation_prompt,
        userConfirmedAt: row.user_confirmed_at ? new Date(row.user_confirmed_at) : undefined,
        executionStatus: row.execution_status as 'success' | 'failed' | 'blocked',
        executionError: row.execution_error,
        durationMs: row.duration_ms,
        costImpact: row.cost_impact,
        workflowPhase: row.workflow_phase,
        taskId: row.task_id,
        remarks: row.remarks,
      }));
    },

    /**
     * 获取审计日志统计信息
     */
    async getStats(sessionId: string): Promise<AuditLogStats> {
      const stmt = db.prepare(`
        SELECT * FROM audit_stats_cache WHERE session_id = ?
      `);
      const stats = stmt.get(sessionId) as any;

      if (!stats) {
        return {
          totalActions: 0,
          byPermission: { safe: 0, restricted: 0, dangerous: 0 },
          deniedActions: 0,
          userConfirmedDangerous: 0,
          totalCostImpact: 0,
          avgExecutionDurationMs: 0,
        };
      }

      return {
        totalActions: stats.total_actions,
        byPermission: {
          safe: stats.safe_count,
          restricted: stats.restricted_count,
          dangerous: stats.dangerous_count,
        },
        deniedActions: stats.denied_count,
        userConfirmedDangerous: stats.user_confirmed_count,
        totalCostImpact: stats.total_cost_impact,
        avgExecutionDurationMs: stats.avg_execution_duration_ms,
      };
    },

    /**
     * 删除指定天数之前的审计日志
     */
    async deleteOlderThan(days: number): Promise<number> {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const stmt = db.prepare('DELETE FROM audit_logs WHERE timestamp < ?');
      const info = stmt.run(cutoffDate.toISOString());

      // 重新计算所有会话的统计
      const sessions = db.prepare('SELECT DISTINCT session_id FROM audit_logs').all() as any[];
      sessions.forEach(row => {
        updateStatsCache(db, row.session_id);
      });

      return info.changes;
    },
  };
}

/**
 * 更新统计缓存
 */
function updateStatsCache(db: Database.Database, sessionId: string): void {
  // 先查询现有数据
  const query = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN tool_permission = 'safe' THEN 1 ELSE 0 END) as safe_count,
      SUM(CASE WHEN tool_permission = 'restricted' THEN 1 ELSE 0 END) as restricted_count,
      SUM(CASE WHEN tool_permission = 'dangerous' THEN 1 ELSE 0 END) as dangerous_count,
      SUM(CASE WHEN decision = 'denied' THEN 1 ELSE 0 END) as denied_count,
      SUM(CASE WHEN decision = 'user_confirmed' THEN 1 ELSE 0 END) as user_confirmed_count,
      COALESCE(SUM(cost_impact), 0) as total_cost,
      COALESCE(AVG(duration_ms), 0) as avg_duration
    FROM audit_logs
    WHERE session_id = ?
  `);

  const stats = query.get(sessionId) as any;

  const upsert = db.prepare(`
    INSERT INTO audit_stats_cache (
      session_id,
      total_actions,
      safe_count,
      restricted_count,
      dangerous_count,
      denied_count,
      user_confirmed_count,
      total_cost_impact,
      avg_execution_duration_ms,
      last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(session_id) DO UPDATE SET
      total_actions = excluded.total_actions,
      safe_count = excluded.safe_count,
      restricted_count = excluded.restricted_count,
      dangerous_count = excluded.dangerous_count,
      denied_count = excluded.denied_count,
      user_confirmed_count = excluded.user_confirmed_count,
      total_cost_impact = excluded.total_cost_impact,
      avg_execution_duration_ms = excluded.avg_execution_duration_ms,
      last_updated = CURRENT_TIMESTAMP
  `);

  upsert.run(
    sessionId,
    stats.total,
    stats.safe_count,
    stats.restricted_count,
    stats.dangerous_count,
    stats.denied_count,
    stats.user_confirmed_count,
    stats.total_cost,
    stats.avg_duration
  );
}
