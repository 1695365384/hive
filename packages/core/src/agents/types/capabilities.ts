/**
 * Agent 能力相关类型定义
 *
 * 包含 AgentCapability 接口、AgentConfig、AgentType 等能力模块相关类型
 */

import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';

/**
 * Agent 类型
 */
export type AgentType = 'explore' | 'plan' | 'general' | 'custom';

/**
 * Agent 配置
 */
export interface AgentConfig extends Omit<AgentDefinition, 'description'> {
  /** Agent 类型标识 */
  type: AgentType;
  /** 描述 */
  description?: string;
  /** 使用的模型 */
  model?: string;
  /** 最大轮次 */
  maxTurns?: number;
  /** 可用工具 */
  tools?: string[];
}

/**
 * Agent 能力接口
 *
 * 所有能力模块必须实现此接口
 */
export interface AgentCapability {
  /** 能力名称（唯一标识） */
  readonly name: string;

  /**
   * 初始化能力
   *
   * @param context - Agent 上下文
   */
  initialize(context: import('./core.js').AgentContext): void | Promise<void>;

  /**
   * 异步初始化（可选）
   *
   * 在所有能力的 initialize() 完成后，按注册顺序调用。
   * 用于需要异步初始化的能力（如数据库连接、网络请求）。
   */
  initializeAsync?(context: import('./core.js').AgentContext): Promise<void>;

  /**
   * 销毁能力（可选）
   *
   * 用于清理资源、取消订阅等
   */
  dispose?(): void | Promise<void>;
}
