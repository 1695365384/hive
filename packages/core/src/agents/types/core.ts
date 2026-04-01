/**
 * Agent 核心类型定义
 *
 * 包含 Agent 选项、状态、注册表、上下文、超时等核心类型
 */

import type { ProviderManager, ProviderConfig, ExternalConfig } from '../../providers/index.js';
import type { SkillRegistry, Skill, SkillMatchResult, SkillSystemConfig } from '../../skills/index.js';
import type { HookRegistry } from '../../hooks/index.js';
import type { SessionCapabilityConfig } from '../capabilities/SessionCapability.js';
import type { AgentConfig, AgentCapability } from './capabilities.js';
import type { ScheduleCircuitBreakEvent } from '../../scheduler/types.js';

// 重导出 SkillSystemConfig
export type { SkillSystemConfig } from '../../skills/index.js';

// Re-export AgentType from capabilities to keep backward compat
export type { AgentType, AgentConfig, AgentCapability } from './capabilities.js';

/**
 * Agent 执行选项
 */
export interface AgentExecuteOptions {
  /** 子 Agent 超时（毫秒），超时后返回错误结果 */
  timeout?: number;
  /** 独立 messages 数组（子 Agent 使用独立对话实例时传入） */
  messages?: Array<Record<string, unknown>>;
  /** 自定义系统提示（覆盖 Agent 默认 prompt） */
  systemPrompt?: string;
  /** 回调：文本输出 */
  onText?: (text: string) => void;
  /** 回调：工具使用 */
  onTool?: (toolName: string, input?: unknown) => void;
  /** 回调：错误 */
  onError?: (error: Error) => void;
}

/**
 * Agent 执行结果
 */
export interface AgentResult {
  /** 输出文本 */
  text: string;
  /** 使用的工具列表 */
  tools: string[];
  /** Token 使用量 */
  usage?: {
    input: number;
    output: number;
  };
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * 探索严格程度
 */
export type ThoroughnessLevel = 'quick' | 'medium' | 'very-thorough';

// ============================================
// Agent 构造函数选项
// ============================================

/**
 * Agent 构造函数选项
 *
 * 用于创建 Agent 实例时传入配置
 */
export interface AgentInitOptions {
  /** 外部配置（由应用层管理） */
  externalConfig?: ExternalConfig;
  /** 技能系统配置 */
  skillConfig?: SkillSystemConfig;
  /** 会话能力配置 */
  sessionConfig?: SessionCapabilityConfig;
  /** 超时配置 */
  timeout?: TimeoutConfig;
  /** 数据库路径（启用 ScheduleEngine 时需要） */
  dbPath?: string;
  /** 定时任务引擎配置 */
  scheduleEngineConfig?: {
    onCircuitBreak?: (event: ScheduleCircuitBreakEvent) => void;
  };
  /** 系统环境信息（注入到 Agent system prompt） */
  environmentContext?: import('../../environment/types.js').EnvironmentContext;
}

// ============================================
// 选项类型
// ============================================

/**
 * Agent 选项
 */
export interface AgentOptions {
  /** 指定 Provider（仅本次请求） */
  providerId?: string;
  /** 指定模型（仅本次请求） */
  modelId?: string;
  /** 指定会话（仅本次请求） */
  sessionId?: string;
  /** 工作目录 */
  cwd?: string;
  /** 允许的工具 */
  tools?: string[];
  /** 最大轮次 */
  maxTurns?: number;
  /** 系统提示 */
  systemPrompt?: string;
  /** 多轮对话历史 */
  messages?: Array<{ role: string; content: string }>;
  /** 使用的子 Agent */
  agents?: import('./capabilities.js').AgentType[];
  /** API 调用超时（毫秒） */
  apiTimeout?: number;
  /** 执行超时（毫秒） */
  executionTimeout?: number;
  /** 外部取消信号 */
  abortSignal?: AbortSignal;
  /** 回调：收到文本 */
  onText?: (text: string) => void;
  /** 回调：工具使用 */
  onTool?: (toolName: string, input?: unknown) => void;
  /** 回调：工具调用（流式，含输入参数） */
  onToolCall?: (toolName: string, input: unknown) => void;
  /** 回调：工具结果 */
  onToolResult?: (toolName: string, output: unknown) => void;
  /** 回调：推理/思考过程 */
  onReasoning?: (text: string) => void;
  /** 回调：错误 */
  onError?: (error: Error) => void;
}

// ============================================
// 核心接口
// ============================================

/**
 * Agent 注册表接口
 */
export interface AgentRegistry {
  /** 获取 Agent 配置 */
  get(name: string): AgentConfig | undefined;
  /** 获取所有 Agent 名称 */
  getAllNames(): string[];
  /** 注册 Agent */
  register(name: string, config: AgentConfig): void;
  /** 检查 Agent 是否存在 */
  has(name: string): boolean;
}

/**
 * Agent 上下文
 *
 * 依赖注入容器，管理所有共享资源
 */
export interface AgentContext {
  /** 提供商管理器 */
  providerManager: ProviderManager;
  /** Agent 运行器 */
  runner: import('../core/runner.js').AgentRunner;
  /** 技能注册表 */
  skillRegistry: SkillRegistry;
  /** Agent 注册表 */
  agentRegistry: AgentRegistry;
  /** Hook 注册表 */
  hookRegistry: HookRegistry;
  /** 系统环境信息（可选，用于注入 Agent system prompt） */
  environmentContext?: import('../../environment/types.js').EnvironmentContext;

  // 能力模块访问
  /** 获取能力模块 */
  getCapability<T extends AgentCapability>(name: string): T;

  // 便捷访问器
  /** 获取当前提供商 */
  getActiveProvider(): ProviderConfig | null;
  /** 获取技能 */
  getSkill(name: string): Skill | undefined;
  /** 匹配技能 */
  matchSkill(input: string): SkillMatchResult | null;
  /** 获取 Agent 配置 */
  getAgentConfig(name: string): AgentConfig | undefined;

  // 超时能力（内置）
  /** 超时能力实例 */
  timeoutCap: import('../capabilities/TimeoutCapability.js').TimeoutCapability;

  // ============================================
  // 类型安全的能力访问器
  // ============================================

  /** 获取 SessionCapability（可能未注册） */
  getSessionCap?(): import('../capabilities/SessionCapability.js').SessionCapability | null;

  /** 获取 ProviderCapability（可能未注册） */
  getProviderCap?(): import('../capabilities/ProviderCapability.js').ProviderCapability | null;
}

// ============================================
// 超时配置
// ============================================

/**
 * 超时配置
 *
 * 控制 Agent 执行的超时和心跳检测
 */
export interface TimeoutConfig {
  /** API 调用超时（毫秒），默认 120000 (2分钟) */
  apiTimeout?: number;
  /** 整体执行超时（毫秒），默认 600000 (10分钟) */
  executionTimeout?: number;
  /** 心跳间隔（毫秒），默认 30000 (30秒) */
  heartbeatInterval?: number;
  /** 无进展超时（毫秒），默认 120000 (2分钟) */
  stallTimeout?: number;
  /** 超时后是否自动重试 */
  retryOnTimeout?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
}

/**
 * 心跳配置
 */
export interface HeartbeatConfig {
  /** 心跳间隔（毫秒） */
  interval: number;
  /** 无进展超时（毫秒） */
  stallTimeout: number;
  /** 卡住后的行为：warn 仅触发 hook 事件，abort 中断执行 */
  action?: 'warn' | 'abort';
  /** 心跳回调 */
  onHeartbeat?: (lastActivity: number) => void;
  /** 检测到卡住时的回调 */
  onStalled?: (lastActivity: number) => void;
}

/**
 * 心跳任务配置
 *
 * 用于 runHeartbeatOnce() 方法，供宿主应用实现周期性巡检
 */
export interface HeartbeatTaskConfig {
  /** 心跳间隔（毫秒，由调度器控制，runHeartbeatOnce 不使用） */
  interval?: number;
  /** 自定义心跳 prompt（默认：读 HEARTBEAT.md，无事项则回复 HEARTBEAT_OK） */
  prompt?: string;
  /** 使用的模型（可选覆盖） */
  model?: string;
  /** 轻量上下文模式（不加载完整会话历史） */
  lightContext?: boolean;
  /** 心跳结果回调 */
  onResult?: (result: HeartbeatResult) => void;
}

/**
 * 心跳结果
 */
export interface HeartbeatResult {
  /** Agent 回复了 HEARTBEAT_OK */
  isOk: boolean;
  /** 有需要关注的事项 */
  hasAlert: boolean;
  /** 回复内容（isOk 时为空） */
  content: string;
  /** Token 使用量 */
  usage?: { input: number; output: number };
}

/**
 * 超时错误
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly type: 'api' | 'execution' | 'stalled',
    public readonly duration: number
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}
