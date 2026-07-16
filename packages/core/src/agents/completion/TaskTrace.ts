/**
 * TaskTrace 构建器 — 在 Coordinator 执行期间收集轨迹
 */

import { detectArtifactsFromToolCall, extractArtifactPathsFromText } from '../../artifacts/artifact-detector.js';
import type { TaskTrace, TraceToolCall, TraceWorkerSpawn } from './types.js';

export function createEmptyTaskTrace(task = ''): TaskTrace {
  return {
    task,
    toolCalls: [],
    workerSpawns: [],
    artifacts: [],
    responseText: '',
  };
}

export class TaskTraceCollector {
  private trace: TaskTrace;

  constructor(task = '') {
    this.trace = createEmptyTaskTrace(task);
  }

  reset(task: string): void {
    this.trace = createEmptyTaskTrace(task);
  }

  /** Returns call index for parallel-safe completion via recordToolResultAt */
  recordToolCall(toolName: string, input?: unknown): number {
    const index = this.trace.toolCalls.length;
    this.trace.toolCalls.push({ toolName, input });
    return index;
  }

  /**
   * Pair result to a specific call index (required when multiple same-name tools
   * run concurrently — LIFO pairing would swap explore∥office outputs).
   */
  recordToolResultAt(index: number, output?: unknown): void {
    const call = this.trace.toolCalls[index];
    if (call) {
      call.output = output;
    } else {
      this.trace.toolCalls.push({ toolName: 'unknown', output });
    }
    this.extractArtifactsFromValue(output);
  }

  /** Sequential pairing: first unfinished call with the same toolName (FIFO) */
  recordToolResult(toolName: string, output?: unknown): void {
    const pending = this.trace.toolCalls.find(
      (c) => c.toolName === toolName && c.output === undefined,
    );
    if (pending) {
      pending.output = output;
    } else {
      this.trace.toolCalls.push({ toolName, output });
    }
    this.extractArtifactsFromValue(output);
  }

  recordWorkerSpawn(workerType: string, description?: string): void {
    this.trace.workerSpawns.push({ workerType, description });
  }

  setResponseText(text: string): void {
    this.trace.responseText = text;
    this.extractArtifactsFromValue(text);
  }

  /** Record deliverable paths from a Worker tool call (send-file, bash, etc.) */
  recordArtifactsFromToolCall(toolName: string, input: unknown, output: unknown): void {
    for (const filePath of detectArtifactsFromToolCall(toolName, input, output)) {
      this.recordArtifact(filePath);
    }
  }

  recordArtifact(filePath: string): void {
    if (filePath && !this.trace.artifacts.includes(filePath)) {
      this.trace.artifacts.push(filePath);
    }
  }

  getTrace(): TaskTrace {
    return {
      ...this.trace,
      toolCalls: [...this.trace.toolCalls],
      workerSpawns: [...this.trace.workerSpawns],
      artifacts: [...new Set(this.trace.artifacts)],
    };
  }

  private extractArtifactsFromValue(value: unknown): void {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    for (const filePath of extractArtifactPathsFromText(text)) {
      this.recordArtifact(filePath);
    }
  }
}

export function getAgentWorkerTypes(trace: TaskTrace): string[] {
  return trace.toolCalls
    .filter(c => c.toolName === 'agent')
    .map(c => (c.input as { type?: string } | undefined)?.type)
    .filter((t): t is string => typeof t === 'string');
}

export function getSpawnedWorkerTypes(trace: TaskTrace): string[] {
  return trace.workerSpawns.map(s => s.workerType);
}
