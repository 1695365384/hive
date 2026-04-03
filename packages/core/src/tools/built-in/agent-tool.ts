/**
 * AgentTool — 进程内异步生成器调用子代理
 *
 * Coordinator 通过 AgentTool 在当前进程内异步调用子代理（Explore/Plan/General）。
 * 直接使用 AgentRunner.executeStreaming() 执行，无需子进程和 IPC 通信。
 *
 * 防递归：子代理的工具来自 ToolRegistry 的类型白名单（不含 agent 工具），天然无法再派生。
 *
 * 优化点（Harness Engineer）：
 *   - 令牌桶限流：Worker 启动前通过 TokenBucketRateLimiter 获取令牌，防止批量启动触发 API 429
 *   - 语义截断：Worker 输出 > MAX_WORKER_RESULT_LENGTH 时用 ContextCompactor 做 LLM 摘要，而非固定比例截断
 */

import { tool, zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { AgentContext } from '../../agents/core/types.js';
import type { AgentResult } from '../../agents/core/types.js';
import type { TaskManager } from '../../agents/core/TaskManager.js';
import type { ScheduleCapability } from '../../agents/capabilities/ScheduleCapability.js';
import { createAgentRunner } from '../../agents/core/runner.js';
import { createScheduleTool } from './schedule-tools.js';
import { getDefaultRateLimiter } from '../harness/rate-limiter.js';
import { createContextCompactor } from '../../agents/pipeline/ContextCompactor.js';

// ============================================
// Schema
// ============================================

const INPUT_SCHEMA = zodSchema(
  z.object({
    prompt: z.string().describe('The task to delegate to the Worker'),
    type: z.enum(['explore', 'plan', 'general', 'schedule']).describe(
      'Worker type: "explore" for read-only research, "plan" for deep analysis, "general" for full-access execution, "schedule" for scheduled task management',
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
const MAX_WORKER_RESULT_LENGTH = 8000;

/**
 * 输出摘录最大长度
 */
const MAX_OUTPUT_EXCERPT = 1500;

/**
 * 智能摘录：保留首尾，中间省略
 * Worker 输出的重要信息（Overview/结论）通常在开头和结尾
 */
function smartExcerpt(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const headLen = Math.floor(maxLength * 0.4);
  const tailLen = maxLength - headLen;
  return text.slice(0, headLen) + '\n\n[...omitted...]\n\n' + text.slice(-tailLen);
}

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

// ============================================
// 卡死检测（空结果循环保护）
// ============================================

const EMPTY_RESULT_WARN_THRESHOLD = 3;
const EMPTY_RESULT_ABORT_THRESHOLD = 5;

/**
 * 判断工具输出是否为"空结果"（成功但无有效数据）
 */
function isEmptyResult(output: string): boolean {
  const s = output.trim();
  if (s.length === 0) return true;
  if (s.length > 200) return false;
  const patterns = [
    /^No .* found/i,
    /^No results/i,
    /^0 .* found/i,
    /^\[?\s*empty\s*\]?$/i,
    /^no matches found/i,
  ];
  return patterns.some(p => p.test(s));
}

/**
 * 计算工具结果的指纹（用于判断"相同结果"）
 */
function getResultFingerprint(toolName: string, output: string): string {
  const normalized = output.trim().slice(0, 100)
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<DATE>')
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<IP>')
    .replace(/\b[0-9a-f]{8,}\b/g, '<HEX>');
  return `${toolName}:${normalized}`;
}

/**
 * 创建闭包隔离的卡死检测器
 *
 * 跟踪同一工具的连续空结果调用，超过阈值时注入 WARNING 或触发 abort。
 */
function createStuckDetector(abortController: AbortController) {
  const recentCalls: Array<{ fingerprint: string; isEmpty: boolean; timestamp: number }> = [];
  let consecutiveEmptyCount = 0;
  let lastFingerprint = '';
  let warned = false;

  function recordResult(toolName: string, output: string): { stuck: boolean; warning: string | null } {
    const now = Date.now();
    const fp = getResultFingerprint(toolName, output);
    const empty = isEmptyResult(output);

    // 清理过期记录
    while (recentCalls.length > 0 && now - recentCalls[0].timestamp > ERROR_TTL_MS) {
      recentCalls.shift();
    }

    recentCalls.push({ fingerprint: fp, isEmpty: empty, timestamp: now });

    // 检查是否是同一工具的连续空结果
    if (fp === lastFingerprint && empty) {
      consecutiveEmptyCount++;
    } else {
      consecutiveEmptyCount = empty ? 1 : 0;
      lastFingerprint = fp;
      warned = false;
    }

    // 阈值 2：达到 abort 阈值，终止 Worker
    if (consecutiveEmptyCount >= EMPTY_RESULT_ABORT_THRESHOLD) {
      console.warn(`[stuck-detector] Tool "${toolName}" returned empty results ${consecutiveEmptyCount} times consecutively. Aborting Worker.`);
      abortController.abort();
      return {
        stuck: true,
        warning: `STOP: Tool "${toolName}" has returned empty results ${consecutiveEmptyCount} times. This is likely a dead-end. Report to the user that the requested information could not be found.`,
      };
    }

    // 阈值 1：达到警告阈值，注入 WARNING（只注入一次）
    if (consecutiveEmptyCount >= EMPTY_RESULT_WARN_THRESHOLD && !warned) {
      warned = true;
      console.warn(`[stuck-detector] Tool "${toolName}" returned empty results ${consecutiveEmptyCount} times. Injecting warning.`);
      return {
        stuck: true,
        warning: `WARNING: Tool "${toolName}" has returned empty/no-result responses ${consecutiveEmptyCount} consecutive times. Try a fundamentally different approach or inform the user that the information is not available. Do NOT call this tool again with similar parameters.`,
      };
    }

    return { stuck: false, warning: null };
  }

  function reset(): void {
    recentCalls.length = 0;
    consecutiveEmptyCount = 0;
    lastFingerprint = '';
    warned = false;
  }

  return { recordResult, reset };
}

/**
 * 构建结构化 Worker 结果摘要
 *
 * 注意：语义截断（ContextCompactor）是异步的，此函数仅用于构建摘要头部+摘录。
 * 实际摘要由 buildWorkerResultSummaryAsync 处理。
 */
function buildWorkerResultSummary(input: {
  type: string;
  result: { text: string; tools: string[]; success: boolean; error?: string };
  accumulatedText: string;
  duration: number;
  shouldBlockRetry: (error: string) => boolean;
  stuckWarning?: string | null;
  /** 已压缩的文本摘要（由 ContextCompactor 生成），若有则替代 smartExcerpt */
  compressedExcerpt?: string | null;
}): string {
  const { type, result, accumulatedText, duration, shouldBlockRetry, stuckWarning, compressedExcerpt } = input;
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

  // 卡死检测警告
  if (stuckWarning) {
    parts.push(stuckWarning);
  }

  // 使用的工具
  if (result.tools.length > 0) {
    parts.push(`Tools used: ${result.tools.join(', ')}`);
  }

  // 输出摘录：优先使用语义摘要，回退到启发式截断
  if (accumulatedText.trim()) {
    const excerpt = compressedExcerpt ?? smartExcerpt(accumulatedText, MAX_OUTPUT_EXCERPT);
    const label = compressedExcerpt ? 'Summary' : 'Output';
    parts.push(`${label} (${accumulatedText.length} chars):\n${excerpt}`);
  }

  let summary = parts.join('\n\n');
  if (summary.length > MAX_WORKER_RESULT_LENGTH) {
    summary = summary.slice(0, MAX_WORKER_RESULT_LENGTH) + '\n\n... [result truncated]';
  }
  return summary;
}

/**
 * 创建 AgentTool
 *
 * Coordinator 调用此工具在当前进程内异步执行子代理。
 * 通过 hook 实时透传中间事件（text, tool-call, tool-result, reasoning）。
 * 取消时直接通过 AbortController 中止 LLM 请求。
 *
 * @returns Tool 实例和 clearErrorHistory 方法（错误历史通过闭包隔离）
 */
export function createAgentTool(context: AgentContext, taskManager: TaskManager): Tool & { clearErrorHistory: () => void } {
  const { shouldBlockRetry, clearErrorHistory } = createRetryGuard();

  // 共享 AgentRunner：复用父进程的 ProviderManager，子代理共享 provider 配置
  const runner = createAgentRunner(context.providerManager);

  // 语义截断：使用 ContextCompactor 对超长 Worker 输出做 LLM 摘要
  const compactor = createContextCompactor(context.providerManager);

  // 令牌桶限流器：防止批量 Worker 启动触发 LLM API 429
  const rateLimiter = getDefaultRateLimiter();

  const agentTool = tool({
    description: [
      'Delegate a task to a Worker agent in an isolated context window.',
      '',
      '## Worker Types',
      '- "explore": Read-only (Glob, Grep, Read, WebSearch, WebFetch). Use for: file discovery, code search, architecture understanding.',
      '- "plan": Deep analysis (same tools, higher thoroughness). Use for: complex planning, dependency analysis, risk assessment.',
      '- "general": Full access (Bash, File write, Glob, Grep, Web). Use for: code modifications, running commands, complex tasks.',
      '- "schedule": Schedule management (create, list, pause, resume, remove, history). Use for: creating/managing scheduled/cron tasks.',
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

      // 令牌桶限流：等待可用令牌，防止批量启动 Worker 触发 API 429
      await rateLimiter.acquire();

      // 注册 Worker（获取 AbortController）
      const abortController = taskManager.register(workerId, input.type, input.description);

      // 卡死检测器（与 AbortController 联动）
      const stuckDetector = createStuckDetector(abortController);
      let stuckWarning: string | null = null;

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

      try {
        // 提前退出：Worker 在启动前已被中止
        if (isAborted()) {
          rateLimiter.release();
          taskManager.unregister(workerId);
          emitComplete(false, 'Worker aborted before start');
          return buildAbortResult();
        }

        // 在当前进程内执行子代理
        // 注入平台信息到 prompt，避免 Worker 用错命令语法（如 macOS 的 ps 与 Linux 不同）
        const envCtx = context.environmentContext;
        const platformHint = envCtx
          ? `\n[Platform: ${envCtx.os.displayName} (${envCtx.os.platform}/${envCtx.os.arch}), Shell: ${envCtx.shell}]`
          : '';

        // Schedule Worker 需要动态注册 schedule 工具（因为白名单为空，工具需要闭包持有 ScheduleCapability）
        if (input.type === 'schedule') {
          try {
            const scheduleCap = context.getCapability<ScheduleCapability>('schedule');
            const registry = runner.getToolRegistry();
            registry.register('schedule', createScheduleTool(scheduleCap));
          } catch {
            // ScheduleCapability 未注册，schedule Worker 将无工具可用
          }
        }

        const result = await runner.executeStreaming(
          input.type,
          platformHint + input.prompt,
          {
            onText: (text: string) => {
              if (isAborted()) return;
              accumulatedText += text;
            },
            onToolCall: (toolName: string, toolInput?: unknown) => {
              if (isAborted()) return;
              context.hookRegistry.emit('worker:tool-call', {
                workerId,
                workerType: input.type,
                toolName,
                input: toolInput,
                sessionId,
                timestamp: new Date(),
              }).catch(() => {});
            },
            onToolResult: (toolName: string, output?: unknown) => {
              if (isAborted()) return;

              // 卡死检测：检查空结果循环
              const outputStr = typeof output === 'string' ? output : JSON.stringify(output ?? '');
              const detection = stuckDetector.recordResult(toolName, outputStr);
              if (detection.warning && !stuckWarning) {
                stuckWarning = detection.warning;
                accumulatedText += `\n\n${detection.warning}`;
              }

              context.hookRegistry.emit('worker:tool-result', {
                workerId,
                workerType: input.type,
                toolName,
                output,
                sessionId,
                timestamp: new Date(),
              }).catch(() => {});
            },
            onReasoning: (text: string) => {
              if (isAborted()) return;
              context.hookRegistry.emit('worker:reasoning', {
                workerId,
                workerType: input.type,
                text,
                sessionId,
                timestamp: new Date(),
              }).catch(() => {});
            },
          },
          {
            model: input.model,
            maxTurns: input.maxTurns,
            abortSignal: abortController.signal,
          },
        );

        // 正常完成 — 清理
        rateLimiter.release();
        taskManager.unregister(workerId);
        if (!result.success) {
          console.error(`[worker:${workerId.slice(0, 8)}] Task failed: ${result.error || 'unknown error'}`);
        }
        emitComplete(result.success, result.error);

        // 语义截断：Worker 输出超过阈值时用 ContextCompactor 做 LLM 摘要
        let compressedExcerpt: string | null = null;
        if (accumulatedText.length > MAX_WORKER_RESULT_LENGTH && result.success) {
          try {
            const agentType = input.type === 'schedule' ? 'general' : input.type;
            const phaseResult = await compactor.compressPhase(
              { text: accumulatedText, tools: result.tools, success: true },
              agentType as 'explore' | 'plan' | 'general',
            );
            compressedExcerpt = phaseResult.summary;
          } catch {
            // ContextCompactor 失败时回退到启发式截断（buildWorkerResultSummary 默认行为）
          }
        }

        return buildWorkerResultSummary({
          type: input.type,
          result,
          accumulatedText,
          duration: Date.now() - startTime,
          shouldBlockRetry,
          stuckWarning,
          compressedExcerpt,
        });
      } catch (error) {
        rateLimiter.release();
        taskManager.unregister(workerId);
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[worker:${workerId.slice(0, 8)}] Execution failed: ${errorMsg}`);
        emitComplete(false, errorMsg);
        return buildWorkerResultSummary({
          type: input.type,
          result: { text: '', tools: [], success: false, error: errorMsg },
          accumulatedText,
          duration: Date.now() - startTime,
          shouldBlockRetry,
          stuckWarning,
        });
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

// 导出供测试使用
export { isEmptyResult, createStuckDetector, getResultFingerprint };
