/**
 * Server 工厂类型定义
 */

import type { Agent } from '../agents/index.js';
import type { ILogger } from '../types/logger.js';
import type { ExternalConfig } from '../providers/index.js';
import type { IChannel, IPlugin, ChannelMessage } from '../plugins/index.js';
import type { ScheduleCircuitBreakEvent } from '../scheduler/types.js';
import type { EnvironmentContext } from '../environment/types.js';

// ============================================
// 流式事件类型
// ============================================

/** 流式事件联合类型（替代 MessageBus agent:streaming topic） */
export type StreamingEventUnion =
  | { type: 'start'; sessionId: string }
  | { type: 'reasoning'; sessionId: string; text: string; workerId?: string; workerType?: string }
  | { type: 'text-delta'; sessionId: string; text: string }
  | { type: 'tool-call'; sessionId: string; tool: string; input: unknown; workerId?: string; workerType?: string }
  | { type: 'tool-result'; sessionId: string; tool: string; output: unknown; workerId?: string; workerType?: string }
  | { type: 'worker-start'; sessionId: string; workerId: string; workerType: string; description?: string }
  | { type: 'worker-complete'; sessionId: string; workerId: string; workerType: string; success: boolean; error?: string; duration: number }
  | { type: 'complete'; sessionId: string; success: boolean; cancelled?: boolean; error?: string };

/** 流式事件回调 */
export type StreamingHandler = (event: StreamingEventUnion) => void;

/** 文件事件 */
export interface FileEvent {
  sessionId: string;
  threadId: string;
  filePath: string;
  content: string;
  type: string;
}

/** 文件事件回调 */
export type FileHandler = (event: FileEvent) => void;

/** 消息处理回调（替代 IMessageBus，供插件使用） */
export type MessageHandler = (message: ChannelMessage) => void;

/**
 * Server 心跳配置
 */
export interface ServerHeartbeatConfig {
  /** 心跳间隔（毫秒） */
  intervalMs: number;
  /** 使用的模型 */
  model?: string;
  /** 自定义心跳 prompt */
  prompt?: string;
}

/**
 * Server 配置选项
 */
export interface ServerOptions {
  config: {
    /** 外部配置（Provider 等） */
    externalConfig?: ExternalConfig;
    /** 心跳配置（启用时启动 HeartbeatScheduler） */
    heartbeat?: ServerHeartbeatConfig;
    /** 定时任务引擎配置 */
    scheduleEngine?: {
      onCircuitBreak?: (event: ScheduleCircuitBreakEvent) => void;
    };
  };
  /** 已实例化的插件列表 */
  plugins?: IPlugin[];
  /** 数据库路径（启用 ScheduleEngine + Session） */
  dbPath?: string;
  /** 可选，自定义 Logger */
  logger?: ILogger;
  /** 可选，系统环境信息（注入到 Agent system prompt） */
  environmentContext?: EnvironmentContext;
}

/**
 * Server 接口
 */
export interface Server {
  readonly agent: Agent;
  readonly logger: ILogger;
  start(): Promise<void>;
  stop(): Promise<void>;
  getChannel(id: string): IChannel | undefined;
  registerChannel(channel: IChannel): void;
  getPlugin(id: string): IPlugin | undefined;
  replacePlugin(id: string, plugin: IPlugin): void;

  /** 处理来自通道的用户消息 */
  handleMessage(message: ChannelMessage): void;

  /** 中止指定 session 的 Agent 执行 */
  abort(sessionId: string): void;

  /** 注册流式事件回调，返回取消注册函数 */
  onStreamingEvent(handler: StreamingHandler): () => void;

  /** 注册文件事件回调，返回取消注册函数 */
  onFileEvent(handler: FileHandler): () => void;

  /** 发射文件事件到所有注册的 handler */
  emitFileEvent(event: FileEvent): void;
}
