/**
 * 自定义 MCP 工具 - 记忆存储
 * 让 Agent 可以记住跨会话的信息
 *
 * 使用 SQLite 作为持久化后端
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { IMemoryRepository } from '../storage/MemoryRepository.js';

// Global repository instance
let memoryRepository: IMemoryRepository | null = null;

/**
 * Set memory repository (must be called before using tools)
 */
export function setMemoryRepository(repo: IMemoryRepository): void {
  memoryRepository = repo;
}

/**
 * Get memory repository
 */
export function getMemoryRepository(): IMemoryRepository | null {
  return memoryRepository;
}

// 记住信息
const rememberTool = tool(
  'remember',
  '记住一条信息，跨会话持久化存储',
  {
    key: z.string().describe('记忆的键名'),
    value: z.string().describe('要记住的值'),
    tags: z.array(z.string()).optional().describe('可选的标签，用于分类'),
  },
  async (args) => {
    if (!memoryRepository) {
      return {
        content: [{ type: 'text', text: '❌ Memory repository not initialized' }],
      };
    }

    const now = new Date();
    const existing = await memoryRepository.get(args.key);

    await memoryRepository.set(args.key, {
      value: args.value,
      tags: args.tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    return {
      content: [{ type: 'text', text: `🧠 已记住: ${args.key}` }],
    };
  }
);

// 回忆信息
const recallTool = tool(
  'recall',
  '回忆之前记住的信息',
  {
    key: z.string().optional().describe('记忆的键名，不提供则列出所有'),
    tag: z.string().optional().describe('按标签筛选'),
  },
  async (args) => {
    if (!memoryRepository) {
      return {
        content: [{ type: 'text', text: '❌ Memory repository not initialized' }],
      };
    }

    if (args.key) {
      const entry = await memoryRepository.get(args.key);
      if (!entry) {
        return {
          content: [{ type: 'text', text: `❌ 未找到记忆: ${args.key}` }],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: `💭 ${args.key}: ${entry.value}\n   创建: ${entry.createdAt.toISOString()}\n   更新: ${entry.updatedAt.toISOString()}`,
          },
        ],
      };
    }

    // 列出所有或按标签筛选
    const entries = args.tag
      ? await memoryRepository.getByTag(args.tag)
      : Object.values(await memoryRepository.getAll());

    if (entries.length === 0) {
      return {
        content: [{ type: 'text', text: '📭 没有找到任何记忆' }],
      };
    }

    const list = entries
      .map((e) => `- ${e.key}: ${e.value.slice(0, 50)}...`)
      .join('\n');
    return {
      content: [{ type: 'text', text: `🧠 记忆列表 (${entries.length}条):\n${list}` }],
    };
  }
);

// 遗忘信息
const forgetTool = tool(
  'forget',
  '遗忘一条记忆',
  {
    key: z.string().describe('要遗忘的记忆键名'),
  },
  async (args) => {
    if (!memoryRepository) {
      return {
        content: [{ type: 'text', text: '❌ Memory repository not initialized' }],
      };
    }

    const deleted = await memoryRepository.delete(args.key);
    if (!deleted) {
      return {
        content: [{ type: 'text', text: `❌ 未找到记忆: ${args.key}` }],
      };
    }
    return {
      content: [{ type: 'text', text: `🗑️ 已遗忘: ${args.key}` }],
    };
  }
);

// 创建 MCP 服务器
export const memoryMcpServer = createSdkMcpServer({
  name: 'memory-server',
  tools: [rememberTool, recallTool, forgetTool],
});
