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
  createEnvTool,
  type AskUserCallback,
} from './built-in/index.js';
import { setAskUserCallback } from './built-in/ask-user-tool.js';
import { setSendFileCallback, type SendFileCallback } from './built-in/send-file-tool.js';
import { setEnvDbProvider } from './built-in/env-tool.js';
import type { AgentType as CapabilityAgentType } from '../agents/types/capabilities.js';

/** Agent types that have tool whitelists in the registry */
export type AgentType = 'explore' | 'plan' | 'general' | 'schedule' | 'critic' | 'arbiter';

/**
 * Agent 类型对应的工具白名单
 *
 * - explore: 只读工具（file 只读版、glob、grep、web-search、web-fetch、env）
 * - general: 全量工具（含 bash、file 全量版、ask-user、send-file、env）
 * - schedule: 空白名单，schedule 工具由 agent-tool.ts 在 spawn 时动态注册
 *
 * 'plan' 使用与 explore 相同的只读工具集。
 */
const AGENT_TOOL_WHITELIST: Record<AgentType, Array<{ name: string; factory: () => Tool }>> = {
  explore: [
    { name: 'file', factory: () => createFileTool({ allowedCommands: ['view'] }) },
    { name: 'glob', factory: () => createGlobTool() },
    { name: 'grep', factory: () => createGrepTool() },
    { name: 'web-search', factory: () => createWebSearchTool() },
    { name: 'web-fetch', factory: () => createWebFetchTool() },
    { name: 'env', factory: () => createEnvTool() },
  ],
  plan: [
    { name: 'file', factory: () => createFileTool({ allowedCommands: ['view'] }) },
    { name: 'glob', factory: () => createGlobTool() },
    { name: 'grep', factory: () => createGrepTool() },
    { name: 'web-search', factory: () => createWebSearchTool() },
    { name: 'web-fetch', factory: () => createWebFetchTool() },
    { name: 'env', factory: () => createEnvTool() },
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
    { name: 'env', factory: () => createEnvTool() },
  ],
  schedule: [],
  critic: [
    { name: 'file', factory: () => createFileTool({ allowedCommands: ['view'] }) },
    { name: 'glob', factory: () => createGlobTool() },
    { name: 'grep', factory: () => createGrepTool() },
    { name: 'web-search', factory: () => createWebSearchTool() },
    { name: 'web-fetch', factory: () => createWebFetchTool() },
    { name: 'env', factory: () => createEnvTool() },
  ],
  arbiter: [
    { name: 'file', factory: () => createFileTool({ allowedCommands: ['view'] }) },
    { name: 'glob', factory: () => createGlobTool() },
    { name: 'grep', factory: () => createGrepTool() },
    { name: 'web-search', factory: () => createWebSearchTool() },
    { name: 'web-fetch', factory: () => createWebFetchTool() },
    { name: 'env', factory: () => createEnvTool() },
  ],
};

/**
 * 工具注册表
 *
 * 管理所有工具的注册、查询和按 Agent 类型分配。
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  /** 自定义 Agent 类型的工具白名单（由 Vertical Pack 注册） */
  private customAgentTools: Map<string, string[]> = new Map();

  /**
   * 注册工具
   */
  register(name: string, tool: Tool): void {
    this.tools.set(name, tool);
  }

  /**
   * 注销工具（Vertical Pack 卸载时使用）
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 注销自定义 Agent 类型的工具白名单（Vertical Pack 卸载时使用）
   */
  unregisterAgentTools(agentType: string): boolean {
    return this.customAgentTools.delete(agentType);
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
   * 获取指定 Agent 类型的工具描述列表（用于 prompt 注入）
   */
  getToolDescriptions(agentType: string): Array<{ name: string; description: string }> {
    const tools = this.getToolsForAgent(agentType);
    return Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description ?? '',
    }));
  }

  /**
   * 获取指定 Agent 类型的工具集
   *
   * 查找优先级：
   * 1. customAgentTools 中注册的动态白名单（Vertical Pack 声明的 agent）
   * 2. AGENT_TOOL_WHITELIST 硬编码白名单（内置 agent）
   * 3. fallback 到 general
   *
   * 无论哪种白名单，都会叠加通过 register() 注册的自定义工具。
   */
  getToolsForAgent(agentType: string): Record<string, Tool> {
    // 优先查动态白名单（pack 注册的）
    const customWhitelist = this.customAgentTools.get(agentType);
    const result: Record<string, Tool> = {};

    if (customWhitelist) {
      // pack 声明的 agent：按声明的 toolNames 取工具
      for (const toolName of customWhitelist) {
        // 内置工具（如 bash/file/glob）按工厂创建
        const builtinFactory = this.findBuiltinFactory(toolName);
        if (builtinFactory) {
          result[toolName] = builtinFactory();
        } else if (this.tools.has(toolName)) {
          // pack 注册的自定义工具
          result[toolName] = this.tools.get(toolName)!;
        }
      }
      return result;
    }

    // 内置 agent：按硬编码白名单
    const whitelist = AGENT_TOOL_WHITELIST[agentType as AgentType] ?? AGENT_TOOL_WHITELIST.general;
    for (const item of whitelist) {
      result[item.name] = item.factory();
    }

    // 叠加自定义工具（外部注册的工具对所有内置 Agent 类型可见）
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
   * 在内置白名单中查找工具工厂（用于 pack 声明的 agent 复用内置工具）
   */
  private findBuiltinFactory(toolName: string): (() => Tool) | null {
    for (const list of Object.values(AGENT_TOOL_WHITELIST)) {
      const found = list.find(w => w.name === toolName);
      if (found) return found.factory;
    }
    return null;
  }

  /**
   * 注册自定义 Agent 类型的工具白名单（Vertical Pack 使用）
   *
   * 这让 pack 声明的 agent（如 'legal-reviewer'）能精确控制可用工具集，
   * 而不是 fallback 到 general。
   *
   * @param agentType  Agent 类型标识
   * @param toolNames  该 agent 可用的工具名列表（内置工具名 + pack 自定义工具名）
   */
  registerAgentTools(agentType: string, toolNames: string[]): void {
    this.customAgentTools.set(agentType, toolNames);
  }

  /**
   * 注册所有内置工具
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

  /**
   * 设置 query-environment 数据库路径提供者
   */
  setEnvDbProvider(provider: () => string | undefined): void {
    setEnvDbProvider(provider);
  }
}

/**
 * 创建 ToolRegistry 实例
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
