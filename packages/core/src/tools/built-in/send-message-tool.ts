/**
 * SendMessageTool — Coordinator 状态消息
 *
 * Coordinator 通过此工具向用户发送状态更新或通知消息。
 * 消息通过 notification:push hook 传递到前端。
 */

import { tool, zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import type { AgentContext } from '../../agents/core/types.js';

// ============================================
// Schema
// ============================================

const INPUT_SCHEMA = zodSchema(
  z.object({
    message: z.string().describe('Message to send to the user'),
    type: z.enum(['info', 'warning', 'success', 'error']).optional()
      .describe('Message type (default: info)'),
  }),
);

// ============================================
// 工厂函数
// ============================================

/**
 * 创建 SendMessageTool
 */
export function createSendMessageTool(context: AgentContext): Tool {
  return tool({
    description: [
      'Send a status update or message to the user.',
      '',
      'Use this to:',
      '- Inform the user about the current progress',
      '- Provide status updates while Workers are running',
      '- Send warnings or error notifications',
    ].join('\n'),
    inputSchema: INPUT_SCHEMA,
    execute: async (input): Promise<string> => {
      const sessionId = context.hookRegistry.getSessionId();

      await context.hookRegistry.emit('notification:push', {
        sessionId,
        type: input.type || 'info',
        title: 'Coordinator',
        message: input.message,
        timestamp: new Date(),
      });

      return `Message sent: ${input.message}`;
    },
  });
}
