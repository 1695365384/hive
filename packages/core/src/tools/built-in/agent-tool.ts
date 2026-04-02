/**
 * AgentTool — 派生 Worker 子代理
 *
 * Coordinator 通过 AgentTool 异步 spawn Worker（Explore/Plan/General）。
 * Worker 在独立 context 中执行，事件通过 hook 实时透传。
 * Worker 完成后返回文本摘要给 Coordinator。
 *
 * 防递归：Worker 工具来自 ToolRegistry（不含 agent 工具），天然无法再 spawn。
 */

import { tool, zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { AgentContext } from '../../agents/core/types.js';
import type { AgentExecuteOptions } from '../../agents/types.js';
import type { TaskManager } from '../../agents/core/TaskManager.js';
import { truncateOutput } from './utils/output-safety.js';

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
 * 创建 AgentTool
 *
 * Coordinator 调用此工具 spawn Worker，Worker 事件通过 hook 实时透传。
 */
export function createAgentTool(context: AgentContext, taskManager: TaskManager): Tool {
  return tool({
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
      'You can launch multiple Workers in parallel by calling agent() multiple times in a single response.',
      'Each Worker runs independently and returns its result separately.',
    ].join('\n'),
    inputSchema: INPUT_SCHEMA,
    execute: async (input): Promise<string> => {
      const workerId = randomUUID();
      const startTime = Date.now();
      const sessionId = context.hookRegistry.getSessionId();

      // 注册 Worker
      const abortController = taskManager.register(workerId, input.type, input.description);

      // 通知 Worker 启动
      await context.hookRegistry.emit('worker:start', {
        workerId,
        workerType: input.type,
        description: input.description,
        sessionId,
        timestamp: new Date(),
      });

      // 构建运行时选项
      const opts: AgentExecuteOptions = {
        timeout: 300_000, // 5 分钟超时
      };
      if (input.model) opts.model = input.model;
      if (input.maxTurns) opts.maxTurns = input.maxTurns;

      let accumulatedText = '';

      try {
        const result = await context.runner.executeStreaming(
          input.type,
          input.prompt,
          {
            onText: (text: string) => {
              accumulatedText += text;
            },
            onToolCall: (toolName: string, toolInput: unknown) => {
              context.hookRegistry.emit('worker:tool-call', {
                workerId,
                workerType: input.type,
                toolName,
                input: toolInput,
                sessionId,
                timestamp: new Date(),
              }).catch(() => {});
            },
            onToolResult: (toolName: string, output: unknown) => {
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
              context.hookRegistry.emit('worker:reasoning', {
                workerId,
                workerType: input.type,
                text,
                sessionId,
                timestamp: new Date(),
              }).catch(() => {});
            },
          },
          Object.keys(opts).length > 0 ? opts : undefined,
        );

        // 注销 Worker
        taskManager.unregister(workerId);

        // 通知 Worker 完成
        await context.hookRegistry.emit('worker:complete', {
          workerId,
          workerType: input.type,
          success: result.success,
          error: result.error,
          duration: Date.now() - startTime,
          sessionId,
          timestamp: new Date(),
        });

        if (result.error) {
          return `Worker error (${input.type}): ${result.error}`;
        }

        return truncateOutput(accumulatedText || 'Worker returned no output', MAX_WORKER_RESULT_LENGTH);
      } catch (error) {
        taskManager.unregister(workerId);

        const errorMsg = error instanceof Error ? error.message : String(error);
        await context.hookRegistry.emit('worker:complete', {
          workerId,
          workerType: input.type,
          success: false,
          error: errorMsg,
          duration: Date.now() - startTime,
          sessionId,
          timestamp: new Date(),
        });

        return `Worker error (${input.type}): ${errorMsg}`;
      }
    },
  });
}
