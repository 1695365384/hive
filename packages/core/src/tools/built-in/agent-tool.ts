/**
 * AgentTool — 派生 Worker 子代理
 *
 * Coordinator 通过 AgentTool 异步 spawn Worker（Explore/Plan/General）。
 * Worker 在独立线程（worker_threads）中执行，事件通过 parentPort 实时透传。
 * 取消时先发送 abort 消息让 Worker 优雅终止（AI SDK 取消 LLM 请求），
 * 再 worker.terminate() 强制杀线程兜底。
 *
 * 防递归：Worker 工具来自 ToolRegistry（不含 agent 工具），天然无法再 spawn。
 */

import { Worker } from 'node:worker_threads';
import { tool, zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { resolveAsset } from '../../utils/sea-path.js';
import type { AgentContext } from '../../agents/core/types.js';
import type { AgentResult } from '../../agents/core/types.js';
import type { TaskManager } from '../../agents/core/TaskManager.js';
import type { WorkerEventMessage, WorkerInboundMessage } from '../../workers/worker-entry.js';
import type { ExternalConfig } from '../../providers/types.js';

// ============================================
// Schema
// ============================================

const INPUT_SCHEMA = zodSchema(
  z.object({
    prompt: z.string().describe('The task to delegate to the Worker'),
    type: z.enum(['explore', 'plan', 'general']).describe(
      'Worker type: "explore" for read-only research, "plan" for deep analysis, "general" for full-access execution',
    ),
    model: z.string().optional().describe('Override model for this Worker'),
    maxTurns: z.number().int().min(1).max(50).optional().describe('Override max turns'),
    description: z.string().optional().describe('Human-readable description of this Worker'),
  }),
);

// ============================================
// 工厂函数
// ============================================

/**
 * Worker 结果最大返回长度（防止 Coordinator context 膨胀）
 */
const MAX_WORKER_RESULT_LENGTH = 4000;

/**
 * 输出摘录最大长度
 */
const MAX_OUTPUT_EXCERPT = 500;

// ============================================
// 失败重试保护
// ============================================

const MAX_SAME_ERROR_RETRIES = 2;
const ERROR_TTL_MS = 300_000; // 5 分钟

function getErrorFingerprint(error: string): string {
  return error
    .replace(/\/Users\/[^/]+\//g, '<HOME>/')
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, '<IP>')
    .replace(/\b[0-9a-f]{8,}\b/g, '<HEX>')
    .trim()
    .slice(0, 200);
}

/**
 * 创建闭包隔离的错误重试保护器
 */
function createRetryGuard() {
  const recentErrors: Array<{ fingerprint: string; timestamp: number }> = [];

  function shouldBlockRetry(error: string): boolean {
    const fp = getErrorFingerprint(error);
    const now = Date.now();

    // 清理过期记录
    while (recentErrors.length > 0 && now - recentErrors[0].timestamp > ERROR_TTL_MS) {
      recentErrors.shift();
    }

    const count = recentErrors.filter(e => e.fingerprint === fp).length;
    recentErrors.push({ fingerprint: fp, timestamp: now });
    return count >= MAX_SAME_ERROR_RETRIES;
  }

  function clearErrorHistory(): void {
    recentErrors.length = 0;
  }

  return { shouldBlockRetry, clearErrorHistory };
}

/**
 * 构建结构化 Worker 结果摘要
 */
function buildWorkerResultSummary(input: {
  type: string;
  result: { text: string; tools: string[]; success: boolean; error?: string };
  accumulatedText: string;
  duration: number;
  shouldBlockRetry: (error: string) => boolean;
}): string {
  const { type, result, accumulatedText, duration, shouldBlockRetry } = input;
  const parts: string[] = [];

  // 状态行
  const lineCount = accumulatedText.split('\n').filter(l => l.trim()).length;
  parts.push(`[Worker ${type} completed in ${duration.toFixed(1)}s — ${lineCount} lines output]`);

  // 成功/失败
  if (result.error) {
    parts.push(`Status: FAILED — ${result.error}`);

    // 检查是否应该阻止重试
    if (shouldBlockRetry(result.error)) {
      parts.push('WARNING: This same error has occurred multiple times. DO NOT retry with the same approach. Report the error to the user and suggest alternatives.');
    }
  } else {
    parts.push('Status: SUCCESS');
  }

  // 使用的工具
  if (result.tools.length > 0) {
    parts.push(`Tools used: ${result.tools.join(', ')}`);
  }

  // 输出摘录（最后 N 字符）
  if (accumulatedText.trim()) {
    const excerpt = accumulatedText.length > MAX_OUTPUT_EXCERPT
      ? accumulatedText.slice(-MAX_OUTPUT_EXCERPT) + '\n... (truncated)'
      : accumulatedText;
    parts.push(`Output excerpt:\n${excerpt}`);
  }

  let summary = parts.join('\n\n');
  if (summary.length > MAX_WORKER_RESULT_LENGTH) {
    summary = summary.slice(0, MAX_WORKER_RESULT_LENGTH) + '\n\n... [result truncated]';
  }
  return summary;
}

/**
 * Worker 线程入口文件路径
 *
 * 通过 resolveAsset() 自动处理 ESM / SEA / CJS 三种环境。
 * SEA 包结构：server/
 *   ├── hive-server (SEA binary)
 *   ├── dist/workers/worker-entry.js
 *   └── node_modules/
 */
let _cachedWorkerPath: string | undefined;

function resolveWorkerEntryPath(): string {
  if (_cachedWorkerPath) return _cachedWorkerPath;
  _cachedWorkerPath = resolveAsset(
    '../../workers/worker-entry.js',
    'dist/workers/worker-entry.js',
    import.meta.url,
  );
  return _cachedWorkerPath;
}

/**
 * 创建 AgentTool
 *
 * Coordinator 调用此工具 spawn Worker（独立线程），Worker 事件通过 hook 实时透传。
 * 取消时直接 worker.terminate() 杀线程。
 *
 * @returns Tool 实例和 clearErrorHistory 方法（错误历史通过闭包隔离）
 */
export function createAgentTool(context: AgentContext, taskManager: TaskManager): Tool & { clearErrorHistory: () => void } {
  const { shouldBlockRetry, clearErrorHistory } = createRetryGuard();

  const agentTool = tool({
    description: [
      'Delegate a task to a Worker agent in an isolated context window.',
      '',
      '## Worker Types',
      '- "explore": Read-only (Glob, Grep, Read, WebSearch, WebFetch). Use for: file discovery, code search, architecture understanding.',
      '- "plan": Deep analysis (same tools, higher thoroughness). Use for: complex planning, dependency analysis, risk assessment.',
      '- "general": Full access (Bash, File write, Glob, Grep, Web). Use for: code modifications, running commands, complex tasks.',
      '',
      '## When to Use',
      '- Task requires extensive file reading that would consume your context',
      '- You need parallel research on multiple independent topics (call agent() multiple times in one response)',
      '- Task involves file modifications or command execution (use "general")',
      '',
      '## When NOT to Use',
      '- Simple text responses (respond directly)',
      '- You already have sufficient context',
      '',
      '## Parallel Execution',
      'CRITICAL: Calling agent() multiple times in ONE response runs Workers TRULY IN PARALLEL.',
      '3 parallel Workers complete in ~1/3 the time of 3 sequential ones.',
      'Always parallelize independent tasks — research, exploration, independent modifications.',
    ].join('\n'),
    inputSchema: INPUT_SCHEMA,
    execute: async (input): Promise<string> => {
      const workerId = randomUUID();
      const startTime = Date.now();
      const sessionId = context.hookRegistry.getSessionId();

      // 注册 Worker（获取 AbortController）
      const abortController = taskManager.register(workerId, input.type, input.description);

      // 构建外部配置（传递给 Worker 线程以继承 Provider 配置）
      const externalConfig: ExternalConfig = {
        providers: context.providerManager.all,
        activeProvider: context.providerManager.active?.id,
      };

      // 启动 Worker 线程（通过 workerData 传递 Provider 配置）
      const worker = new Worker(resolveWorkerEntryPath(), {
        workerData: { externalConfig },
      });
      taskManager.setWorker(workerId, worker);

      // 通知 Worker 启动
      await context.hookRegistry.emit('worker:start', {
        workerId,
        workerType: input.type,
        description: input.description,
        sessionId,
        timestamp: new Date(),
      });

      let accumulatedText = '';
      const isAborted = () => abortController.signal.aborted;

      // 构建 abort 结果
      const buildAbortResult = () => buildWorkerResultSummary({
        type: input.type,
        result: { text: '', tools: [], success: false, error: 'Worker aborted' },
        accumulatedText,
        duration: Date.now() - startTime,
        shouldBlockRetry,
      });

      // 通知 Worker 完成的辅助函数
      const emitComplete = (success: boolean, error?: string) => {
        context.hookRegistry.emit('worker:complete', {
          workerId,
          workerType: input.type,
          success,
          error,
          duration: Date.now() - startTime,
          sessionId,
          timestamp: new Date(),
        }).catch(() => {});
      };

      // Abort promise：信号触发时立即 resolve，同时向 Worker 发送 abort 消息
      const abortPromise = new Promise<true>((resolve) => {
        const triggerAbort = () => {
          // 优雅终止：通知 Worker 内部 AbortController 取消 LLM 请求
          try { worker.postMessage({ type: 'abort' } satisfies WorkerInboundMessage); } catch {}
          resolve(true);
        };
        if (isAborted()) { triggerAbort(); return; }
        const handler = () => triggerAbort();
        abortController.signal.addEventListener('abort', handler, { once: true });
      });

      // Worker 结果 promise（必须在 timeoutPromise 之前定义）
      const resultPromise = new Promise<AgentResult>((resolve, reject) => {
        worker.on('message', (msg: WorkerEventMessage) => {
          if (isAborted()) return; // abort 后忽略后续消息

          switch (msg.type) {
            case 'text':
              accumulatedText += msg.text;
              break;
            case 'tool-call':
              context.hookRegistry.emit('worker:tool-call', {
                workerId,
                workerType: input.type,
                toolName: msg.toolName,
                input: msg.input,
                sessionId,
                timestamp: new Date(),
              }).catch(() => {});
              break;
            case 'tool-result':
              context.hookRegistry.emit('worker:tool-result', {
                workerId,
                workerType: input.type,
                toolName: msg.toolName,
                output: msg.output,
                sessionId,
                timestamp: new Date(),
              }).catch(() => {});
              break;
            case 'reasoning':
              context.hookRegistry.emit('worker:reasoning', {
                workerId,
                workerType: input.type,
                text: msg.text,
                sessionId,
                timestamp: new Date(),
              }).catch(() => {});
              break;
            case 'complete':
              resolve(msg.result);
              break;
            case 'error':
              reject(new Error(msg.error));
              break;
          }
        });

        worker.on('error', (error) => {
          reject(error);
        });

        worker.on('exit', (code) => {
          if (code !== 0 && !isAborted()) {
            reject(new Error(`Worker exited with code ${code}`));
          }
        });
      });

      // Worker 级别兜底超时（5 分钟），防止 Worker 永远不返回
      const WORKER_TIMEOUT_MS = 5 * 60 * 1000;
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<true>((resolve) => {
        timeoutTimer = setTimeout(() => {
          resolve(true); // 超时视为 abort
        }, WORKER_TIMEOUT_MS);
      });

      try {
        // 提前退出：Worker 在启动前已被中止
        if (isAborted()) {
          taskManager.unregister(workerId);
          emitComplete(false, 'Worker aborted before start');
          return buildAbortResult();
        }

        // 发送执行指令到 Worker 线程
        worker.postMessage({
          type: 'execute',
          payload: {
            agentType: input.type,
            prompt: input.prompt,
            model: input.model,
            maxTurns: input.maxTurns,
          },
        });

        // Race: 正常完成 vs abort vs timeout
        const raceResult = await Promise.race([resultPromise, abortPromise, timeoutPromise]);

        if (raceResult === true) {
          // Abort 或超时胜出 — 杀线程
          taskManager.unregister(workerId);
          const isTimeout = abortController.signal.aborted === false;
          emitComplete(false, isTimeout ? 'Worker timed out after 5 minutes' : 'Worker aborted');
          return buildAbortResult();
        }

        // 正常完成 — 清理线程
        taskManager.unregister(workerId);
        emitComplete(raceResult.success, raceResult.error);

        return buildWorkerResultSummary({
          type: input.type,
          result: raceResult,
          accumulatedText,
          duration: Date.now() - startTime,
          shouldBlockRetry,
        });
      } catch (error) {
        taskManager.unregister(workerId);
        const errorMsg = error instanceof Error ? error.message : String(error);
        emitComplete(false, errorMsg);
        return buildWorkerResultSummary({
          type: input.type,
          result: { text: '', tools: [], success: false, error: errorMsg },
          accumulatedText,
          duration: Date.now() - startTime,
          shouldBlockRetry,
        });
      } finally {
        if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
      }
    },
  }) as Tool & { clearErrorHistory: () => void };

  // 将 clearErrorHistory 挂到返回的工具对象上（闭包隔离）
  (agentTool as any).clearErrorHistory = clearErrorHistory;
  return agentTool;
}

/**
 * 清除错误历史（向后兼容的模块级导出）
 *
 * @deprecated 使用 createAgentTool() 返回对象的 clearErrorHistory 方法
 */
export function clearErrorHistory(): void {
  // 模块级导出仅做 no-op，实际清除由实例级 clearErrorHistory 处理
}
