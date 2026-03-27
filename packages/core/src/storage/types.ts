/**
 * Database row types for type-safe SQLite queries.
 *
 * These interfaces map directly to table column names (snake_case).
 * Use with better-sqlite3 generic methods: `.get<SessionRow>()`, `.all<MessageRow>()`.
 */

/** Row type for the `sessions` table */
export interface SessionRow {
  id: string;
  group_name: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  metadata: string | null;
  compression_state: string | null;
}

/** Row type for the `messages` table */
export interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: string;
  token_count: number | null;
  sequence: number;
}

/** Row type for the `memories` table */
export interface MemoryRow {
  key: string;
  value: string;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

/** Row type for session list query (with message count) */
export interface SessionListRow {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  metadata: string | null;
  message_count: number;
}

/** Minimal row type for "exists" or "get id" queries */
export interface IdRow {
  id: string;
}
