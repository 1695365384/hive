/**
 * Schedules V2 Migration
 *
 * Extends schedules table with:
 * - schedule_kind: cron / every / at
 * - interval_ms: for 'every' mode
 * - run_at: for 'at' mode
 * - delete_after_run: one-shot auto cleanup
 * - consecutive_errors: circuit breaker tracking
 * - notify_config: push notification config (JSON)
 * - source: user / auto
 * - auto_created_by: agent id for auto-created tasks
 */

import { registerMigration } from '../MigrationRunner.js';

const SCHEDULES_V2_UP = `
-- New columns for multi-mode scheduling
ALTER TABLE schedules ADD COLUMN schedule_kind TEXT NOT NULL DEFAULT 'cron';
ALTER TABLE schedules ADD COLUMN interval_ms INTEGER;
ALTER TABLE schedules ADD COLUMN run_at TEXT;

-- One-shot task cleanup
ALTER TABLE schedules ADD COLUMN delete_after_run INTEGER NOT NULL DEFAULT 0;

-- Circuit breaker
ALTER TABLE schedules ADD COLUMN consecutive_errors INTEGER NOT NULL DEFAULT 0;

-- Push notification config (JSON: { mode, channel, to, bestEffort })
ALTER TABLE schedules ADD COLUMN notify_config TEXT;

-- Task source tracking
ALTER TABLE schedules ADD COLUMN source TEXT NOT NULL DEFAULT 'user';
ALTER TABLE schedules ADD COLUMN auto_created_by TEXT;

-- Index for source-based queries
CREATE INDEX IF NOT EXISTS idx_schedules_source ON schedules(source);
`;

const SCHEDULES_V2_DOWN = `
DROP INDEX IF EXISTS idx_schedules_source;
-- SQLite does not support DROP COLUMN before 3.35.0, so we recreate.
-- For simplicity, we leave columns in place on rollback.
`;

// Register migration
registerMigration({
  version: 3,
  name: 'schedules-v2',
  up: SCHEDULES_V2_UP,
  down: SCHEDULES_V2_DOWN,
});

export { SCHEDULES_V2_UP, SCHEDULES_V2_DOWN };
