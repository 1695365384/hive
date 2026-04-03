/**
 * Schedule Tool — 定时任务管理工具
 *
 * Schedule Worker 专用工具，通过 action 字段分派到 ScheduleCapability 的各个方法。
 * 工厂函数通过闭包持有 ScheduleCapability 引用。
 */

import { tool, zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import type { ScheduleCapability } from '../../agents/capabilities/ScheduleCapability.js';

// ============================================
// Schema
// ============================================

const INPUT_SCHEMA = zodSchema(
  z.object({
    action: z.enum(['create', 'list', 'remove', 'pause', 'resume', 'history']).describe(
      'Action to perform: "create" (new task from natural language), "list" (all tasks), "remove" (delete), "pause", "resume", "history" (execution records)',
    ),
    name: z.string().optional().describe('Task name (for create)'),
    prompt: z.string().optional().describe('Execution prompt — what the agent should do when the task fires (for create)'),
    schedule: z.string().optional().describe('Schedule expression: cron expression, "every X minutes/hours", or ISO datetime (for create)'),
    target: z.string().optional().describe('Task name or ID (for remove/pause/resume/history)'),
  }),
);

// ============================================
// 工厂函数
// ============================================

/**
 * 创建 Schedule 工具
 *
 * @param cap - ScheduleCapability 实例
 */
export function createScheduleTool(cap: ScheduleCapability): Tool {
  return tool({
    description: [
      'Manage scheduled tasks (create, list, pause, resume, remove, view history).',
      '',
      '## Actions',
      '- "create": Create a new scheduled task. Requires: name, prompt, schedule.',
      '  - schedule accepts: cron expression ("0 9 * * *"), natural language ("every 30 minutes"), or ISO datetime ("2026-04-01T15:00:00").',
      '- "list": List all scheduled tasks with their status.',
      '- "pause": Pause a task by name or ID.',
      '- "resume": Resume a paused task by name or ID.',
      '- "remove": Delete a task by name or ID.',
      '- "history": View execution records for a task.',
      '',
      '## Important',
      '- Always confirm with the user before creating a task.',
      '- The "prompt" field defines what the agent will do when the task fires — write it clearly.',
      '- You can only manage schedules, not execute tasks directly.',
    ].join('\n'),
    inputSchema: INPUT_SCHEMA,
    execute: async (input): Promise<string> => {
      switch (input.action) {
        case 'create': {
          if (!input.name || !input.prompt || !input.schedule) {
            return 'Missing required fields for create: name, prompt, and schedule are all required.';
          }
          // Use createFromNaturalLanguage with a constructed message
          const message = `创建定时任务：名称"${input.name}"，时间"${input.schedule}"，内容"${input.prompt}"`;
          return cap.createFromNaturalLanguage(message);
        }

        case 'list':
          return cap.list();

        case 'remove': {
          if (!input.target) return 'Missing required field: target (task name or ID).';
          return cap.remove(input.target);
        }

        case 'pause': {
          if (!input.target) return 'Missing required field: target (task name or ID).';
          return cap.pause(input.target);
        }

        case 'resume': {
          if (!input.target) return 'Missing required field: target (task name or ID).';
          return cap.resume(input.target);
        }

        case 'history': {
          if (!input.target) return 'Missing required field: target (task name or ID).';
          return cap.history(input.target);
        }

        default:
          return `Unknown action: "${input.action}". Use: create, list, remove, pause, resume, history.`;
      }
    },
  });
}
