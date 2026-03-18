/**
 * 自定义 MCP 工具 - 用户偏好管理
 * 让 Agent 可以读取和修改用户偏好
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { preferences } from '../services/preferences.js';

// 获取偏好工具
const getPreferenceTool = tool(
  'get_user_preference',
  '获取用户的偏好设置，如语言、主题、默认模型等',
  {
    key: z.string().describe('偏好键名，如 language, theme, defaultModel 等'),
  },
  async (args) => {
    const value = preferences.get(args.key as any);
    return {
      content: [
        {
          type: 'text',
          text: value !== undefined ? `${args.key}: ${JSON.stringify(value)}` : `未找到偏好: ${args.key}`,
        },
      ],
    };
  }
);

// 设置偏好工具
const setPreferenceTool = tool(
  'set_user_preference',
  '设置用户的偏好设置',
  {
    key: z.string().describe('偏好键名'),
    value: z.string().describe('偏好值（JSON 字符串）'),
  },
  async (args) => {
    try {
      const parsedValue = JSON.parse(args.value);
      preferences.set(args.key as any, parsedValue);
      return {
        content: [{ type: 'text', text: `✅ 已保存偏好: ${args.key} = ${args.value}` }],
      };
    } catch {
      // 如果不是 JSON，直接存储为字符串
      preferences.set(args.key as any, args.value);
      return {
        content: [{ type: 'text', text: `✅ 已保存偏好: ${args.key} = ${args.value}` }],
      };
    }
  }
);

// 列出所有偏好
const listPreferencesTool = tool(
  'list_user_preferences',
  '列出所有用户偏好设置',
  {},
  async () => {
    const all = preferences.getAll();
    return {
      content: [
        {
          type: 'text',
          text: `📋 用户偏好设置:\n${JSON.stringify(all, null, 2)}`,
        },
      ],
    };
  }
);

// 重置偏好
const resetPreferencesTool = tool(
  'reset_user_preferences',
  '重置所有用户偏好为默认值',
  {
    confirm: z.boolean().describe('确认重置，必须为 true'),
  },
  async (args) => {
    if (!args.confirm) {
      return {
        content: [{ type: 'text', text: '❌ 重置已取消，请设置 confirm=true 确认' }],
      };
    }
    preferences.reset();
    return {
      content: [{ type: 'text', text: '✅ 所有偏好已重置为默认值' }],
    };
  }
);

// 创建 MCP 服务器
export const preferencesMcpServer = createSdkMcpServer({
  name: 'preferences-server',
  tools: [getPreferenceTool, setPreferenceTool, listPreferencesTool, resetPreferencesTool],
});
