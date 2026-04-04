/**
 * SQLite 审计日志存储库测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createSqliteAuditLogRepository, AUDIT_LOG_MIGRATION_UP } from '../../src/tools/audit-repository.js';
import type { AuditLogEntry } from '../../src/tools/audit-types.js';

describe('SQLite Audit Log Repository', () => {
  let db: Database.Database;
  let repository: ReturnType<typeof createSqliteAuditLogRepository>;

  beforeEach(() => {
    db = new Database(':memory:');
    repository = createSqliteAuditLogRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('save', () => {
    it('should save audit log entry', async () => {
      const entry: AuditLogEntry = {
        id: 'test-1',
        sessionId: 'session-1',
        timestamp: new Date(),
        toolName: 'read-file',
        toolPermission: 'safe',
        toolInput: JSON.stringify({ path: '/tmp/test' }),
        decision: 'allowed',
        executionStatus: 'success',
      };

      await repository.save(entry);

      const result = await repository.query({ sessionId: 'session-1' });
      expect(result).toHaveLength(1);
    });

    it('should generate id if not provided', async () => {
      const entry: Omit<AuditLogEntry, 'id'> & { id?: string } = {
        sessionId: 'session-1',
        timestamp: new Date(),
        toolName: 'write-file',
        toolPermission: 'restricted',
        toolInput: JSON.stringify({ path: '/tmp/file' }),
        decision: 'allowed',
        executionStatus: 'success',
      };

      // TS doesn't allow explicit undefined, so we pass without id
      await repository.save(entry as AuditLogEntry);

      const result = await repository.query({ sessionId: 'session-1' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBeDefined();
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      const entries: AuditLogEntry[] = [
        {
          id: 'test-1',
          sessionId: 'session-1',
          timestamp: new Date(),
          toolName: 'read-file',
          toolPermission: 'safe',
          toolInput: JSON.stringify({ path: '/tmp/test' }),
          decision: 'allowed',
          executionStatus: 'success',
        },
        {
          id: 'test-2',
          sessionId: 'session-1',
          timestamp: new Date(),
          toolName: 'delete-file',
          toolPermission: 'dangerous',
          toolInput: JSON.stringify({ path: '/tmp/file' }),
          decision: 'denied',
          executionStatus: 'blocked',
        },
        {
          id: 'test-3',
          sessionId: 'session-2',
          timestamp: new Date(),
          toolName: 'run-command',
          toolPermission: 'restricted',
          toolInput: JSON.stringify({ cmd: 'ls' }),
          decision: 'user_confirmed',
          executionStatus: 'success',
        },
      ];

      for (const entry of entries) {
        await repository.save(entry);
      }
    });

    it('should query by session id', async () => {
      const result = await repository.query({ sessionId: 'session-1' });
      expect(result).toHaveLength(2);
    });

    it('should query by tool permission', async () => {
      const result = await repository.query({
        sessionId: 'session-1',
        toolPermission: 'dangerous',
      });
      expect(result).toHaveLength(1);
      expect(result[0].toolName).toBe('delete-file');
    });

    it('should query by decision', async () => {
      const result = await repository.query({
        sessionId: 'session-1',
        decision: 'allowed',
      });
      expect(result).toHaveLength(1);
    });

    it('should support limit and offset', async () => {
      const result1 = await repository.query({
        sessionId: 'session-1',
        limit: 1,
      });
      expect(result1).toHaveLength(1);

      const result2 = await repository.query({
        sessionId: 'session-1',
        limit: 1,
        offset: 1,
      });
      expect(result2).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      const entries: AuditLogEntry[] = [
        {
          id: 'test-1',
          sessionId: 'session-1',
          timestamp: new Date(),
          toolName: 'read-file',
          toolPermission: 'safe',
          toolInput: JSON.stringify({}),
          decision: 'allowed',
          executionStatus: 'success',
        },
        {
          id: 'test-2',
          sessionId: 'session-1',
          timestamp: new Date(),
          toolName: 'delete-file',
          toolPermission: 'dangerous',
          toolInput: JSON.stringify({}),
          decision: 'denied',
          executionStatus: 'blocked',
        },
      ];

      for (const entry of entries) {
        await repository.save(entry);
      }
    });

    it('should return stats for session', async () => {
      const stats = await repository.getStats('session-1');

      expect(stats.totalActions).toBe(2);
      expect(stats.byPermission.safe).toBe(1);
      expect(stats.byPermission.dangerous).toBe(1);
      expect(stats.deniedActions).toBe(1);
    });

    it('should return zero stats for non-existent session', async () => {
      const stats = await repository.getStats('non-existent');

      expect(stats.totalActions).toBe(0);
      expect(stats.byPermission.safe).toBe(0);
    });
  });

  describe('deleteOlderThan', () => {
    beforeEach(async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const entries: AuditLogEntry[] = [
        {
          id: 'test-1',
          sessionId: 'session-1',
          timestamp: now,
          toolName: 'read-file',
          toolPermission: 'safe',
          toolInput: JSON.stringify({}),
          decision: 'allowed',
          executionStatus: 'success',
        },
        {
          id: 'test-2',
          sessionId: 'session-1',
          timestamp: yesterday,
          toolName: 'write-file',
          toolPermission: 'restricted',
          toolInput: JSON.stringify({}),
          decision: 'allowed',
          executionStatus: 'success',
        },
        {
          id: 'test-3',
          sessionId: 'session-1',
          timestamp: lastWeek,
          toolName: 'delete-file',
          toolPermission: 'dangerous',
          toolInput: JSON.stringify({}),
          decision: 'allowed',
          executionStatus: 'success',
        },
      ];

      for (const entry of entries) {
        await repository.save(entry);
      }
    });

    it('should delete logs older than specified days', async () => {
      const deleted = await repository.deleteOlderThan(3); // 3 days ago
      expect(deleted).toBe(1); // Only the last week entry should be deleted

      const remaining = await repository.query({ sessionId: 'session-1' });
      expect(remaining).toHaveLength(2);
    });
  });
});
