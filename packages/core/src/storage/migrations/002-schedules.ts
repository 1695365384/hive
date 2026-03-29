/**
 * Schedules Migration
 *
 * Creates schedules and schedule_runs tables for the scheduled task system.
 */

import { registerMigration } from '../MigrationRunner.js';

const SCHEDULES_UP = `
-- Schedules table: stores scheduled task definitions
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cron TEXT NOT NULL,
  prompt TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'chat' CHECK(action IN ('chat', 'workflow', 'dispatch')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_run_at TEXT,
  next_run_at TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  metadata JSON
);

-- Schedule runs table: stores execution history
CREATE TABLE IF NOT EXISTS schedule_runs (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'success', 'failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run_at);
CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule ON schedule_runs(schedule_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_runs_status ON schedule_runs(status);
`;

const SCHEDULES_DOWN = `
DROP INDEX IF EXISTS idx_schedule_runs_status;
DROP INDEX IF EXISTS idx_schedule_runs_schedule;
DROP INDEX IF EXISTS idx_schedules_next_run;
DROP INDEX IF EXISTS idx_schedules_enabled;
DROP TABLE IF EXISTS schedule_runs;
DROP TABLE IF EXISTS schedules;
`;

// Register migration
registerMigration({
  version: 2,
  name: 'schedules',
  up: SCHEDULES_UP,
  down: SCHEDULES_DOWN,
});

export { SCHEDULES_UP, SCHEDULES_DOWN };
