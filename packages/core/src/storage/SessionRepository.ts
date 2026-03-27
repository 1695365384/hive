/**
 * Session Repository
 *
 * Provides CRUD operations for sessions using SQLite.
 */

import type Database from 'better-sqlite3';
import type { Session, Message, SessionListItem } from '../session/types.js';
import type { SessionRow, MessageRow, SessionListRow, IdRow } from './types.js';
import { safeJsonParse } from '../utils/safe-json-parse.js';

export interface ISessionRepository {
  save(session: Session): Promise<void>;
  load(sessionId: string): Promise<Session | null>;
  delete(sessionId: string): Promise<boolean>;
  list(group?: string, limit?: number, offset?: number): Promise<SessionListItem[]>;
  getMostRecent(): Promise<Session | null>;
  exists(sessionId: string): boolean;
}

/**
 * Session Repository Implementation
 */
export class SessionRepository implements ISessionRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Save session with all messages (upsert)
   */
  async save(session: Session): Promise<void> {
    const saveTx = this.db.transaction(() => {
      // Upsert session
      const sessionStmt = this.db.prepare(`
        INSERT OR REPLACE INTO sessions
          (id, group_name, title, created_at, updated_at, metadata, compression_state)
        VALUES
          (?, ?, ?, ?, ?, ?, ?)
      `);

      sessionStmt.run(
        session.id,
        'default', // TODO: support groups
        session.metadata.title ?? null,
        session.createdAt.toISOString(),
        session.updatedAt.toISOString(),
        JSON.stringify(session.metadata),
        session.compressionState ? JSON.stringify(session.compressionState) : null
      );

      // Delete existing messages
      this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(session.id);

      // Insert messages
      const msgStmt = this.db.prepare(`
        INSERT INTO messages
          (id, session_id, role, content, timestamp, token_count, sequence)
        VALUES
          (?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < session.messages.length; i++) {
        const msg = session.messages[i];
        msgStmt.run(
          msg.id,
          session.id,
          msg.role,
          msg.content,
          msg.timestamp.toISOString(),
          msg.tokenCount ?? null,
          i
        );
      }
    });

    saveTx();
  }

  /**
   * Load session with all messages
   */
  async load(sessionId: string): Promise<Session | null> {
    const sessionRow = this.db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(sessionId) as SessionRow | undefined;

    if (!sessionRow) {
      return null;
    }

    // Load messages
    const messages = this.db
      .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY sequence')
      .all(sessionId) as MessageRow[];

    return this.rowToSession(sessionRow, messages);
  }

  /**
   * Delete session and all messages (CASCADE)
   */
  async delete(sessionId: string): Promise<boolean> {
    const result = this.db
      .prepare('DELETE FROM sessions WHERE id = ?')
      .run(sessionId);

    return result.changes > 0;
  }

  /**
   * List sessions with pagination
   */
  async list(
    group?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<SessionListItem[]> {
    let sql = `
      SELECT
        s.id,
        s.title,
        s.created_at,
        s.updated_at,
        s.metadata,
        COUNT(m.id) as message_count
      FROM sessions s
      LEFT JOIN messages m ON s.id = m.session_id
    `;

    const params: (string | number)[] = [];

    if (group) {
      sql += ' WHERE s.group_name = ?';
      params.push(group);
    }

    sql += ' GROUP BY s.id ORDER BY s.updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params) as SessionListRow[];

    return rows.map(row => ({
      id: row.id,
      title: row.title ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      messageCount: row.message_count,
      totalTokens: safeJsonParse<{ totalTokens?: number }>(row.metadata ?? '{}', {}).totalTokens ?? 0,
    }));
  }

  /**
   * Get most recent session
   */
  async getMostRecent(): Promise<Session | null> {
    const row = this.db
      .prepare('SELECT id FROM sessions ORDER BY updated_at DESC LIMIT 1')
      .get() as IdRow | undefined;

    if (!row) {
      return null;
    }

    return this.load(row.id);
  }

  /**
   * Check if session exists
   */
  exists(sessionId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM sessions WHERE id = ?')
      .get(sessionId);
    return !!row;
  }

  /**
   * Convert database row to Session object
   */
  private rowToSession(sessionRow: SessionRow, messages: MessageRow[]): Session {
    const metadata = safeJsonParse<Record<string, unknown>>(sessionRow.metadata ?? '{}', {});

    let compressionState: Session['compressionState'];
    if (sessionRow.compression_state) {
      const parsed = safeJsonParse<Record<string, unknown> & { lastCompressedAt?: string }>(
        sessionRow.compression_state,
        {}
      );
      compressionState = {
        ...parsed,
        lastCompressedAt: parsed.lastCompressedAt
          ? new Date(parsed.lastCompressedAt)
          : undefined,
      } as Session['compressionState'];
    }

    return {
      id: sessionRow.id,
      createdAt: new Date(sessionRow.created_at),
      updatedAt: new Date(sessionRow.updated_at),
      messages: messages.map(msg => ({
        id: msg.id,
        role: msg.role as Message['role'],
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        tokenCount: msg.token_count ?? undefined,
      })),
      metadata: {
        totalTokens: (metadata.totalTokens as number) ?? 0,
        messageCount: messages.length,
        lastCompressedAt: metadata.lastCompressedAt
          ? new Date(metadata.lastCompressedAt as string)
          : undefined,
        compressionCount: (metadata.compressionCount as number) ?? 0,
        title: sessionRow.title ?? undefined,
        providerId: metadata.providerId as string | undefined,
        model: metadata.model as string | undefined,
      },
      compressionState,
    };
  }
}

/**
 * Create session repository instance
 */
export function createSessionRepository(db: Database.Database): SessionRepository {
  return new SessionRepository(db);
}
