/**
 * Server 工厂类型定义
 */

import type { Agent } from '../agents/index.js';
import type { MessageBus } from '../bus/index.js';
import type { ILogger } from '../types/logger.js';
import type { ExternalConfig } from '../providers/index.js';
import type { IChannel, IPlugin } from '../plugins/index.js';
import type { ScheduleCircuitBreakEvent } from '../scheduler/types.js';
import type { EnvironmentContext } from '../environment/types.js';

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
  /** 可选，传入已有 MessageBus 实例 */
  bus?: MessageBus;
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
  readonly bus: MessageBus;
  readonly logger: ILogger;
  start(): Promise<void>;
  stop(): Promise<void>;
  getChannel(id: string): IChannel | undefined;
  registerChannel(channel: IChannel): void;
  getPlugin(id: string): IPlugin | undefined;
  replacePlugin(id: string, plugin: IPlugin): void;
}
