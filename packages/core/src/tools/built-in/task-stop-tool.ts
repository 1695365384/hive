/**
 * TaskStopTool — 中止 Worker
 *
 * Coordinator 通过此工具中止正在运行的 Worker。
 */

import { tool, zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import type { TaskManager } from '../../agents/core/TaskManager.js';

// ============================================
// Schema
// ============================================

const INPUT_SCHEMA = zodSchema(
  z.object({
    taskId: z.string().describe('The Worker ID to stop'),
    reason: z.string().optional().describe('Reason for stopping'),
  }),
);

// ============================================
// 工厂函数
// ============================================

/**
 * 创建 TaskStopTool
 */
export function createTaskStopTool(taskManager: TaskManager): Tool {
  return tool({
    description: [
      'Stop a running Worker by its task ID.',
      '',
      'Use this when:',
      '- A Worker is taking too long',
      '- The Worker output is no longer needed',
      '- You want to cancel an ongoing task',
    ].join('\n'),
    inputSchema: INPUT_SCHEMA,
    execute: async (input): Promise<string> => {
      const stopped = taskManager.abort(input.taskId);
      if (stopped) {
        return `Worker ${input.taskId} stopped. Reason: ${input.reason || 'coordinator requested'}`;
      }
      return `Worker ${input.taskId} not found or already completed.`;
    },
  });
}
