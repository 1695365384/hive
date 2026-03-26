/**
 * Initial Schema Migration
 *
 * Creates sessions, messages, and memories tables with indexes.
 */

import { registerMigration } from '../MigrationRunner.js';

const INITIAL_SCHEMA_UP = `
-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  group_name TEXT NOT NULL DEFAULT 'default',
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata JSON,
  compression_state JSON
);

-- Messages table (1:N with sessions)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  token_count INTEGER,
  sequence INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Memories table
CREATE TABLE IF NOT EXISTS memories (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  tags JSON,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sessions_group ON sessions(group_name);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories(tags);
`;

const INITIAL_SCHEMA_DOWN = `
DROP INDEX IF EXISTS idx_memories_tags;
DROP INDEX IF EXISTS idx_messages_session;
DROP INDEX IF EXISTS idx_sessions_updated;
DROP INDEX IF EXISTS idx_sessions_group;
DROP TABLE IF EXISTS memories;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS sessions;
`;

// Register migration
registerMigration({
  version: 1,
  name: 'initial-schema',
  up: INITIAL_SCHEMA_UP,
  down: INITIAL_SCHEMA_DOWN,
});

export { INITIAL_SCHEMA_UP, INITIAL_SCHEMA_DOWN };
