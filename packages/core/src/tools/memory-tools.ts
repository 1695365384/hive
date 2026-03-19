/**
 * 自定义 MCP 工具 - 记忆存储
 * 让 Agent 可以记住跨会话的信息
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import Conf from 'conf';

// 记忆条目 Schema
const MemoryEntrySchema = z.object({
  key: z.string(),
  value: z.unknown(),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()).optional(),
});

type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

// 记忆存储
const memoryStore = new Conf<{ memories: Record<string, MemoryEntry> }>({
  projectName: 'claude-agent-demo',
  configName: 'memories',
  defaults: { memories: {} },
});

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
    const now = new Date().toISOString();
    const existing = memoryStore.get('memories');

    existing[args.key] = {
      key: args.key,
      value: args.value,
      createdAt: existing[args.key]?.createdAt || now,
      updatedAt: now,
      tags: args.tags,
    };

    memoryStore.set('memories', existing);
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
    const memories = memoryStore.get('memories');

    if (args.key) {
      const entry = memories[args.key];
      if (!entry) {
        return {
          content: [{ type: 'text', text: `❌ 未找到记忆: ${args.key}` }],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: `💭 ${args.key}: ${JSON.stringify(entry.value)}\n   创建: ${entry.createdAt}\n   更新: ${entry.updatedAt}`,
          },
        ],
      };
    }

    // 列出所有或按标签筛选
    let entries = Object.values(memories);
    if (args.tag) {
      entries = entries.filter((e) => e.tags?.includes(args.tag!));
    }

    if (entries.length === 0) {
      return {
        content: [{ type: 'text', text: '📭 没有找到任何记忆' }],
      };
    }

    const list = entries
      .map((e) => `- ${e.key}: ${JSON.stringify(e.value).slice(0, 50)}...`)
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
    const memories = memoryStore.get('memories');
    if (!memories[args.key]) {
      return {
        content: [{ type: 'text', text: `❌ 未找到记忆: ${args.key}` }],
      };
    }

    delete memories[args.key];
    memoryStore.set('memories', memories);
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
