/**
 * Workflow Checkpoint Repository
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export type WorkflowCheckpointPhase = 'pending' | 'execute' | 'completed' | 'failed';

export interface WorkflowCheckpoint {
  id: string;
  sessionId: string;
  workflowId: string;
  phase: WorkflowCheckpointPhase;
  taskHash: string;
  checkpointData: string | null;
  lastError: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowCheckpointData {
  task: string;
  partialText?: string;
  finalText?: string;
  tools?: string[];
  usage?: { input: number; output: number };
}

export class CheckpointRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  createOrGet(sessionId: string, workflowId: string, taskHash: string): WorkflowCheckpoint {
    const existing = this.findByWorkflowId(workflowId);
    if (existing) {
      return existing;
    }

    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO workflow_checkpoints (
        id, session_id, workflow_id, phase, task_hash, checkpoint_data, last_error, retry_count, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', ?, NULL, NULL, 0, datetime('now'), datetime('now'))
    `).run(id, sessionId, workflowId, taskHash);

    return this.findByWorkflowId(workflowId)!;
  }

  findByWorkflowId(workflowId: string): WorkflowCheckpoint | null {
    const row = this.db.prepare(`
      SELECT * FROM workflow_checkpoints WHERE workflow_id = ?
    `).get(workflowId) as WorkflowCheckpointRow | undefined;

    if (!row) {
      return null;
    }

    return mapRow(row);
  }

  findLatestByTask(sessionId: string, taskHash: string): WorkflowCheckpoint | null {
    const row = this.db.prepare(`
      SELECT * FROM workflow_checkpoints
      WHERE session_id = ? AND task_hash = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(sessionId, taskHash) as WorkflowCheckpointRow | undefined;

    if (!row) {
      return null;
    }

    return mapRow(row);
  }

  completePhase(workflowId: string, phase: WorkflowCheckpointPhase, checkpointData: WorkflowCheckpointData): void {
    this.db.prepare(`
      UPDATE workflow_checkpoints
      SET phase = ?, checkpoint_data = ?, updated_at = datetime('now')
      WHERE workflow_id = ?
    `).run(phase, JSON.stringify(checkpointData), workflowId);
  }

  markFailed(workflowId: string, error: string, checkpointData?: WorkflowCheckpointData): void {
    const serializedData = checkpointData ? JSON.stringify(checkpointData) : null;
    this.db.prepare(`
      UPDATE workflow_checkpoints
      SET phase = 'failed',
          checkpoint_data = COALESCE(?, checkpoint_data),
          last_error = ?,
          updated_at = datetime('now')
      WHERE workflow_id = ?
    `).run(serializedData, error, workflowId);
  }

  markCompleted(workflowId: string, checkpointData: WorkflowCheckpointData): void {
    this.db.prepare(`
      UPDATE workflow_checkpoints
      SET phase = 'completed', checkpoint_data = ?, last_error = NULL, updated_at = datetime('now')
      WHERE workflow_id = ?
    `).run(JSON.stringify(checkpointData), workflowId);
  }

  incrementRetry(workflowId: string): void {
    this.db.prepare(`
      UPDATE workflow_checkpoints
      SET retry_count = retry_count + 1, updated_at = datetime('now')
      WHERE workflow_id = ?
    `).run(workflowId);
  }
}

interface WorkflowCheckpointRow {
  id: string;
  session_id: string;
  workflow_id: string;
  phase: WorkflowCheckpointPhase;
  task_hash: string;
  checkpoint_data: string | null;
  last_error: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: WorkflowCheckpointRow): WorkflowCheckpoint {
  return {
    id: row.id,
    sessionId: row.session_id,
    workflowId: row.workflow_id,
    phase: row.phase,
    taskHash: row.task_hash,
    checkpointData: row.checkpoint_data,
    lastError: row.last_error,
    retryCount: row.retry_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
