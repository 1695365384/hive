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
