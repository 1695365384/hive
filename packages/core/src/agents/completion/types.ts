/**
 * 任务完成判定 — 类型定义
 */

export interface TraceToolCall {
  toolName: string;
  input?: unknown;
  output?: unknown;
}

export interface TraceWorkerSpawn {
  workerType: string;
  description?: string;
}

export interface TaskTrace {
  task: string;
  toolCalls: TraceToolCall[];
  workerSpawns: TraceWorkerSpawn[];
  artifacts: string[];
  responseText: string;
}

export interface VerifyResult {
  verifierId: string;
  passed: boolean;
  message: string;
  /** Soft failures may be auto-continued by Coordinator discipline loop */
  retryable?: boolean;
}

export interface CompletionVerifyResult {
  passed: boolean;
  results: VerifyResult[];
}

export interface CompletionVerifier {
  readonly id: string;
  match(trace: TaskTrace): boolean;
  verify(trace: TaskTrace): Promise<VerifyResult> | VerifyResult;
}

export interface CompletionVerifierOptions {
  verifiers?: CompletionVerifier[];
}

/** Unified task progress phases for UX + discipline loop */
export type TaskProgressPhase =
  | 'understand'
  | 'plan'
  | 'execute'
  | 'verify'
  | 'continue'
  | 'blocked'
  | 'done';

export interface TaskProgressAction {
  id: 'continue' | 'cancel' | 'provide-info';
  label: string;
}

export interface TaskProgressEvent {
  phase: TaskProgressPhase;
  message?: string;
  reasons?: string[];
  actions?: TaskProgressAction[];
  attempt?: number;
  maxAttempts?: number;
}
