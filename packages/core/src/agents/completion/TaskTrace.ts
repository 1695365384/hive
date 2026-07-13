/**
 * TaskTrace 构建器 — 在 Coordinator 执行期间收集轨迹
 */

import type { TaskTrace, TraceToolCall, TraceWorkerSpawn } from './types.js';

const ARTIFACT_PATH_RE = /(?:[A-Za-z0-9_./~-]+)\.(pptx|docx|xlsx|pdf)/gi;

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

  recordToolCall(toolName: string, input?: unknown): void {
    this.trace.toolCalls.push({ toolName, input });
  }

  recordToolResult(toolName: string, output?: unknown): void {
    const last = [...this.trace.toolCalls].reverse().find(c => c.toolName === toolName && c.output === undefined);
    if (last) {
      last.output = output;
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
    for (const match of text.matchAll(ARTIFACT_PATH_RE)) {
      const path = match[0];
      if (path && !this.trace.artifacts.includes(path)) {
        this.trace.artifacts.push(path);
      }
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
