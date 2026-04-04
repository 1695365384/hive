/**
 * Workflow Checkpoints Migration
 *
 * 用于任务故障恢复，保存工作流执行检查点。
 */

import { registerMigration } from '../MigrationRunner.js';

const WORKFLOW_CHECKPOINTS_UP = `
CREATE TABLE IF NOT EXISTS workflow_checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL UNIQUE,
  phase TEXT NOT NULL DEFAULT 'pending' CHECK(phase IN ('pending', 'execute', 'completed', 'failed')),
  task_hash TEXT NOT NULL,
  checkpoint_data TEXT,
  last_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_session_id
  ON workflow_checkpoints(session_id);
CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_task_hash
  ON workflow_checkpoints(task_hash);
CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_updated_at
  ON workflow_checkpoints(updated_at DESC);
`;

const WORKFLOW_CHECKPOINTS_DOWN = `
DROP INDEX IF EXISTS idx_workflow_checkpoints_updated_at;
DROP INDEX IF EXISTS idx_workflow_checkpoints_task_hash;
DROP INDEX IF EXISTS idx_workflow_checkpoints_session_id;
DROP TABLE IF EXISTS workflow_checkpoints;
`;

registerMigration({
  version: 4,
  name: 'workflow-checkpoints',
  up: WORKFLOW_CHECKPOINTS_UP,
  down: WORKFLOW_CHECKPOINTS_DOWN,
});

export { WORKFLOW_CHECKPOINTS_UP, WORKFLOW_CHECKPOINTS_DOWN };
