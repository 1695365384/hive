/**
 * Goals Migration
 *
 * Persists per-session Goal records so incomplete work survives server restart.
 */

import { registerMigration } from '../MigrationRunner.js';

const GOALS_UP = `
CREATE TABLE IF NOT EXISTS goals (
  session_id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'blocked', 'done', 'cancelled')),
  todos TEXT NOT NULL DEFAULT '[]',
  reasons TEXT NOT NULL DEFAULT '[]',
  audit_attempts INTEGER NOT NULL DEFAULT 0,
  continue_attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_updated ON goals(updated_at DESC);
`;

const GOALS_DOWN = `
DROP INDEX IF EXISTS idx_goals_updated;
DROP INDEX IF EXISTS idx_goals_status;
DROP TABLE IF EXISTS goals;
`;

registerMigration({
  version: 5,
  name: 'goals',
  up: GOALS_UP,
  down: GOALS_DOWN,
});

export { GOALS_UP, GOALS_DOWN };
