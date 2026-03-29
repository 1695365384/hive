/**
 * ToolRegistry — 工具注册表
 *
 * 统一管理工具的注册、查询和按 Agent 类型分配。
 * 支持 AI SDK 标准 Tool 格式。
 */

import { type Tool } from 'ai';
import {
  createBashTool,
  createFileTool,
  fileToolReadOnly,
  createGlobTool,
  createGrepTool,
  createWebSearchTool,
  createWebFetchTool,
  createAskUserTool,
  createSendFileTool,
  type AskUserCallback,
} from './built-in/index.js';
import { setAskUserCallback } from './built-in/ask-user-tool.js';
import { setSendFileCallback, type SendFileCallback } from './built-in/send-file-tool.js';

/** Agent 类型 */
export type AgentType = 'explore' | 'plan' | 'general';

/**
 * Agent 类型对应的工具白名单
 *
 * - explore/plan: 只读工具（file 只读版、glob、grep、web-search、web-fetch）
 * - general: 全量工具（含 bash、file 全量版、ask-user）
 */
const AGENT_TOOL_WHITELIST: Record<AgentType, Array<{ name: string; factory: () => Tool }>> = {
  explore: [
    { name: 'file', factory: () => createFileTool({ allowedCommands: ['view'] }) },
    { name: 'glob', factory: () => createGlobTool() },
    { name: 'grep', factory: () => createGrepTool() },
    { name: 'web-search', factory: () => createWebSearchTool() },
    { name: 'web-fetch', factory: () => createWebFetchTool() },
  ],
  plan: [
    { name: 'file', factory: () => createFileTool({ allowedCommands: ['view'] }) },
    { name: 'glob', factory: () => createGlobTool() },
    { name: 'grep', factory: () => createGrepTool() },
    { name: 'web-search', factory: () => createWebSearchTool() },
    { name: 'web-fetch', factory: () => createWebFetchTool() },
  ],
  general: [
    { name: 'bash', factory: () => createBashTool({ allowed: true }) },
    { name: 'file', factory: () => createFileTool({ allowedCommands: ['view', 'create', 'str_replace', 'insert'] }) },
    { name: 'glob', factory: () => createGlobTool() },
    { name: 'grep', factory: () => createGrepTool() },
    { name: 'web-search', factory: () => createWebSearchTool() },
    { name: 'web-fetch', factory: () => createWebFetchTool() },
    { name: 'ask-user', factory: () => createAskUserTool() },
    { name: 'send-file', factory: () => createSendFileTool() },
  ],
};

/**
 * 工具注册表
 *
 * 管理所有工具的注册、查询和按 Agent 类型分配。
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  /**
   * 注册工具
   */
  register(name: string, tool: Tool): void {
    this.tools.set(name, tool);
  }

  /**
   * 获取单个工具
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具
   */
  getAllTools(): Record<string, Tool> {
    return Object.fromEntries(this.tools.entries());
  }

  /**
   * 获取指定 Agent 类型的工具集
   */
  getToolsForAgent(agentType: string): Record<string, Tool> {
    const whitelist = AGENT_TOOL_WHITELIST[agentType as AgentType] ?? AGENT_TOOL_WHITELIST.general;
    const result: Record<string, Tool> = {};

    // 先添加白名单工具
    for (const item of whitelist) {
      result[item.name] = item.factory();
    }

    // 叠加自定义工具（外部注册的工具对所有 Agent 类型可见）
    // 注意：需要排除所有内置工具名称（不仅仅是当前 agent 的白名单）
    const allBuiltinNames = new Set(
      Object.values(AGENT_TOOL_WHITELIST).flatMap(list => list.map(w => w.name)),
    );
    for (const [name, tool] of this.tools.entries()) {
      if (!allBuiltinNames.has(name)) {
        result[name] = tool;
      }
    }

    return result;
  }

  /**
   * 注册所有内置工具（用于 general Agent）
   */
  registerBuiltInTools(): void {
    const whitelist = AGENT_TOOL_WHITELIST.general;
    for (const item of whitelist) {
      this.tools.set(item.name, item.factory());
    }
  }

  /**
   * 设置 ask-user 回调
   */
  setAskUserCallback(cb: AskUserCallback): void {
    setAskUserCallback(cb);
  }

  /**
   * 设置 send-file 回调
   */
  setSendFileCallback(cb: SendFileCallback): void {
    setSendFileCallback(cb);
  }
}

/**
 * 创建 ToolRegistry 实例
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
