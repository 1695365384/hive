/**
 * WorkflowCheckpointCapability
 *
 * 保存/恢复任务执行检查点。
 */

import { createHash } from 'crypto';
import type { AgentCapability, AgentContext } from '../core/types.js';
import { createDatabase, type DatabaseConfig } from '../../storage/Database.js';
import {
  CheckpointRepository,
  type WorkflowCheckpoint,
  type WorkflowCheckpointData,
} from '../../storage/CheckpointRepository.js';

export interface WorkflowCheckpointCapabilityConfig {
  dbPath?: string;
  maxRetries?: number;
  repository?: CheckpointRepository;
}

export interface ResumeInfo {
  checkpointId: string;
  workflowId: string;
  phase: 'pending' | 'execute' | 'completed' | 'failed';
  retryCount: number;
  data: WorkflowCheckpointData | null;
}

export class WorkflowCheckpointCapability implements AgentCapability {
  readonly name = 'workflow-checkpoint';
  private static readonly DEFAULT_MAX_RETRIES = 3;

  private context: AgentContext | null = null;
  private repository: CheckpointRepository | null;
  private config: Required<Pick<WorkflowCheckpointCapabilityConfig, 'maxRetries'>> & Omit<WorkflowCheckpointCapabilityConfig, 'maxRetries'>;
  private dbManager: ReturnType<typeof createDatabase> | null = null;

  constructor(config?: WorkflowCheckpointCapabilityConfig) {
    this.config = {
      maxRetries: config?.maxRetries ?? WorkflowCheckpointCapability.DEFAULT_MAX_RETRIES,
      dbPath: config?.dbPath,
      repository: config?.repository,
    };
    this.repository = config?.repository ?? null;
  }

  initialize(context: AgentContext): void {
    this.context = context;
  }

  async initializeAsync(): Promise<void> {
    if (this.repository) {
      return;
    }

    const databaseConfig: DatabaseConfig = {
      dbPath: this.config.dbPath ?? '.hive/hive.db',
    };
    this.dbManager = createDatabase(databaseConfig);
    await this.dbManager.initialize();
    this.repository = new CheckpointRepository(this.dbManager.getDb());
  }

  dispose(): void {
    this.context = null;
  }

  startWorkflow(sessionId: string, task: string): WorkflowCheckpoint {
    const repo = this.requireRepo();
    const taskHash = buildTaskHash(sessionId, task);
    const workflowId = `wf_${sessionId}_${taskHash}`;
    return repo.createOrGet(sessionId, workflowId, taskHash);
  }

  canResume(sessionId: string, task: string): ResumeInfo | null {
    const repo = this.requireRepo();
    const taskHash = buildTaskHash(sessionId, task);
    const checkpoint = repo.findLatestByTask(sessionId, taskHash);

    if (!checkpoint) {
      return null;
    }

    if (checkpoint.phase === 'completed') {
      return {
        checkpointId: checkpoint.id,
        workflowId: checkpoint.workflowId,
        phase: checkpoint.phase,
        retryCount: checkpoint.retryCount,
        data: parseCheckpointData(checkpoint.checkpointData),
      };
    }

    if (checkpoint.phase === 'failed' && checkpoint.retryCount < this.config.maxRetries) {
      return {
        checkpointId: checkpoint.id,
        workflowId: checkpoint.workflowId,
        phase: checkpoint.phase,
        retryCount: checkpoint.retryCount,
        data: parseCheckpointData(checkpoint.checkpointData),
      };
    }

    return null;
  }

  markExecute(workflowId: string, data: WorkflowCheckpointData): void {
    const repo = this.requireRepo();
    repo.completePhase(workflowId, 'execute', data);
  }

  markCompleted(workflowId: string, data: WorkflowCheckpointData): void {
    const repo = this.requireRepo();
    repo.markCompleted(workflowId, data);
  }

  markFailed(workflowId: string, error: string, data?: WorkflowCheckpointData): void {
    const repo = this.requireRepo();
    repo.incrementRetry(workflowId);
    repo.markFailed(workflowId, error, data);
  }

  private requireRepo(): CheckpointRepository {
    if (!this.repository) {
      throw new Error('WorkflowCheckpointCapability repository is not initialized');
    }
    return this.repository;
  }
}

export function buildTaskHash(sessionId: string, task: string): string {
  return createHash('sha256')
    .update(`${sessionId}:${task.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 16);
}

function parseCheckpointData(value: string | null): WorkflowCheckpointData | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (typeof parsed.task !== 'string') {
      return null;
    }
    const output: WorkflowCheckpointData = { task: parsed.task };
    if (typeof parsed.partialText === 'string') {
      output.partialText = parsed.partialText;
    }
    if (typeof parsed.finalText === 'string') {
      output.finalText = parsed.finalText;
    }
    if (Array.isArray(parsed.tools)) {
      output.tools = parsed.tools.filter((tool): tool is string => typeof tool === 'string');
    }
    if (
      typeof parsed.usage === 'object' &&
      parsed.usage !== null &&
      typeof (parsed.usage as { input?: unknown }).input === 'number' &&
      typeof (parsed.usage as { output?: unknown }).output === 'number'
    ) {
      output.usage = {
        input: (parsed.usage as { input: number }).input,
        output: (parsed.usage as { output: number }).output,
      };
    }
    return output;
  } catch {
    return null;
  }
}
