/**
 * 监控 Hooks
 *
 * 提供：
 * - 性能监控
 * - 资源分析
 * - 慢调用检测
 * - 调用统计
 */

import {
  type HookRegistry,
  type HookPriority,
  type ToolBeforeHookContext,
  type ToolAfterHookContext,
  type SessionStartHookContext,
  type SessionEndHookContext,
  type HookResult,
} from '../index.js';
import type { ILogger } from '../../plugins/types.js';
import { noopLogger } from '../../plugins/types.js';

/**
 * 工具调用统计
 */
export interface ToolCallStats {
  /** 工具名称 */
  toolName: string;
  /** 调用次数 */
  callCount: number;
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  failureCount: number;
  /** 总耗时（毫秒） */
  totalDuration: number;
  /** 平均耗时（毫秒） */
  avgDuration: number;
  /** 最大耗时（毫秒） */
  maxDuration: number;
  /** 最小耗时（毫秒） */
  minDuration: number;
  /** 最后调用时间 */
  lastCallTime: Date | null;
}

/**
 * 会话统计
 */
export interface SessionStats {
  /** 会话 ID */
  sessionId: string;
  /** 开始时间 */
  startTime: Date;
  /** 结束时间 */
  endTime: Date | null;
  /** 持续时间（毫秒） */
  duration: number;
  /** 工具调用次数 */
  toolCallCount: number;
  /** 成功的工具调用次数 */
  successfulToolCalls: number;
  /** 失败的工具调用次数 */
  failedToolCalls: number;
  /** 是否成功完成 */
  success: boolean;
}

/**
 * 性能告警
 */
export interface PerformanceAlert {
  /** 告警类型 */
  type: 'slow_call' | 'high_failure_rate' | 'memory_warning' | 'timeout';
  /** 工具名称 */
  toolName?: string;
  /** 会话 ID */
  sessionId?: string;
  /** 告警消息 */
  message: string;
  /** 告警数据 */
  data: Record<string, unknown>;
  /** 时间戳 */
  timestamp: Date;
}

/**
 * 监控配置
 */
export interface MonitoringHooksConfig {
  /** 慢调用阈值（毫秒） */
  slowCallThreshold?: number;
  /** 是否启用性能统计 */
  enableStats?: boolean;
  /** 是否记录详细日志 */
  verbose?: boolean;
  /** 告警回调 */
  onAlert?: (alert: PerformanceAlert) => void;
  /** 慢调用回调 */
  onSlowCall?: (toolName: string, duration: number, context: ToolAfterHookContext) => void;
  /** 会话结束回调 */
  onSessionEnd?: (stats: SessionStats) => void;
  /** 工具调用失败回调 */
  onToolFailure?: (toolName: string, error: Error, context: ToolAfterHookContext) => void;
}

/**
 * 监控 Hooks 实现
 */
export class MonitoringHooks {
  private registry: HookRegistry;
  private config: Required<Pick<MonitoringHooksConfig, 'slowCallThreshold' | 'enableStats' | 'verbose'>> & MonitoringHooksConfig;
  private registeredHookIds: string[] = [];
  private logger: ILogger;

  // 统计数据
  private toolStats: Map<string, ToolCallStats> = new Map();
  private sessionStats: Map<string, SessionStats> = new Map();
  private pendingToolCalls: Map<string, number> = new Map(); // toolCallId -> startTime

  constructor(registry: HookRegistry, config: MonitoringHooksConfig = {}, logger?: ILogger) {
    this.registry = registry;
    this.logger = logger ?? noopLogger;
    this.config = {
      slowCallThreshold: config.slowCallThreshold ?? 5000, // 默认 5 秒
      enableStats: config.enableStats ?? true,
      verbose: config.verbose ?? false,
      ...config,
    };
  }

  /**
   * 注册所有监控 Hooks
   */
  register(priority: HookPriority = 'low'): void {
    // 注册会话开始 Hook
    let id = this.registry.on(
      'session:start',
      this.handleSessionStart.bind(this),
      { priority, description: '监控 - 会话开始' }
    );
    this.registeredHookIds.push(id);

    // 注册会话结束 Hook
    id = this.registry.on(
      'session:end',
      this.handleSessionEnd.bind(this),
      { priority, description: '监控 - 会话结束' }
    );
    this.registeredHookIds.push(id);

    // 注册工具执行前 Hook
    id = this.registry.on(
      'tool:before',
      this.handleToolBefore.bind(this),
      { priority, description: '监控 - 工具调用开始' }
    );
    this.registeredHookIds.push(id);

    // 注册工具执行后 Hook
    id = this.registry.on(
      'tool:after',
      this.handleToolAfter.bind(this),
      { priority, description: '监控 - 工具调用结束' }
    );
    this.registeredHookIds.push(id);
  }

  /**
   * 注销所有监控 Hooks
   */
  unregister(): void {
    for (const id of this.registeredHookIds) {
      this.registry.off(id);
    }
    this.registeredHookIds = [];
  }

  // ============================================
  // Hook 处理器
  // ============================================

  /**
   * 处理会话开始
   */
  private async handleSessionStart(context: SessionStartHookContext): Promise<HookResult> {
    if (this.config.verbose) {
      this.logger.info(`[Monitoring] Session started: ${context.sessionId}`);
    }

    this.sessionStats.set(context.sessionId, {
      sessionId: context.sessionId,
      startTime: context.timestamp,
      endTime: null,
      duration: 0,
      toolCallCount: 0,
      successfulToolCalls: 0,
      failedToolCalls: 0,
      success: false,
    });

    return { proceed: true };
  }

  /**
   * 处理会话结束
   */
  private async handleSessionEnd(context: SessionEndHookContext): Promise<HookResult> {
    const stats = this.sessionStats.get(context.sessionId);

    if (stats) {
      stats.endTime = context.timestamp;
      stats.duration = context.duration;
      stats.success = context.success;

      if (this.config.verbose) {
        this.logger.info(
          `[Monitoring] Session ended: ${context.sessionId}, ` +
          `duration: ${context.duration}ms, ` +
          `tool calls: ${stats.toolCallCount}, ` +
          `success: ${context.success}`
        );
      }

      this.config.onSessionEnd?.(stats);
    }

    return { proceed: true };
  }

  /**
   * 处理工具调用开始
   */
  private async handleToolBefore(context: ToolBeforeHookContext): Promise<HookResult> {
    const callId = `${context.sessionId}:${context.toolName}:${Date.now()}`;
    this.pendingToolCalls.set(callId, Date.now());

    if (this.config.verbose) {
      this.logger.info(`[Monitoring] Tool call started: ${context.toolName}`);
    }

    return { proceed: true };
  }

  /**
   * 处理工具调用结束
   */
  private async handleToolAfter(context: ToolAfterHookContext): Promise<HookResult> {
    const { toolName, duration, success, error } = context;

    // 更新工具统计
    if (this.config.enableStats) {
      this.updateToolStats(toolName, duration, success);
    }

    // 更新会话统计
    const sessionStats = this.sessionStats.get(context.sessionId);
    if (sessionStats) {
      sessionStats.toolCallCount++;
      if (success) {
        sessionStats.successfulToolCalls++;
      } else {
        sessionStats.failedToolCalls++;
      }
    }

    // 检测慢调用
    if (duration > this.config.slowCallThreshold) {
      this.config.onSlowCall?.(toolName, duration, context);

      this.config.onAlert?.({
        type: 'slow_call',
        toolName,
        sessionId: context.sessionId,
        message: `慢调用检测: ${toolName} 耗时 ${duration}ms`,
        data: { duration, threshold: this.config.slowCallThreshold },
        timestamp: context.timestamp,
      });
    }

    // 处理失败调用
    if (!success && error) {
      this.config.onToolFailure?.(toolName, error, context);

      // 检查高失败率
      const stats = this.toolStats.get(toolName);
      if (stats && stats.callCount >= 5) {
        const failureRate = stats.failureCount / stats.callCount;
        if (failureRate > 0.5) {
          this.config.onAlert?.({
            type: 'high_failure_rate',
            toolName,
            sessionId: context.sessionId,
            message: `高失败率警告: ${toolName} 失败率 ${(failureRate * 100).toFixed(1)}%`,
            data: { failureRate, failureCount: stats.failureCount, callCount: stats.callCount },
            timestamp: context.timestamp,
          });
        }
      }
    }

    if (this.config.verbose) {
      const status = success ? '✓' : '✗';
      this.logger.info(`[Monitoring] Tool call ${status}: ${toolName} (${duration}ms)`);
    }

    return { proceed: true };
  }

  // ============================================
  // 统计方法
  // ============================================

  /**
   * 更新工具统计
   */
  private updateToolStats(toolName: string, duration: number, success: boolean): void {
    let stats = this.toolStats.get(toolName);

    if (!stats) {
      stats = {
        toolName,
        callCount: 0,
        successCount: 0,
        failureCount: 0,
        totalDuration: 0,
        avgDuration: 0,
        maxDuration: 0,
        minDuration: Infinity,
        lastCallTime: null,
      };
      this.toolStats.set(toolName, stats);
    }

    stats.callCount++;
    if (success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
    }
    stats.totalDuration += duration;
    stats.avgDuration = stats.totalDuration / stats.callCount;
    stats.maxDuration = Math.max(stats.maxDuration, duration);
    stats.minDuration = Math.min(stats.minDuration, duration);
    stats.lastCallTime = new Date();
  }

  /**
   * 获取工具统计
   */
  getToolStats(toolName?: string): ToolCallStats | Map<string, ToolCallStats> {
    if (toolName) {
      return this.toolStats.get(toolName) as ToolCallStats;
    }
    return new Map(this.toolStats);
  }

  /**
   * 获取会话统计
   */
  getSessionStats(sessionId?: string): SessionStats | Map<string, SessionStats> {
    if (sessionId) {
      return this.sessionStats.get(sessionId) as SessionStats;
    }
    return new Map(this.sessionStats);
  }

  /**
   * 获取性能摘要
   */
  getPerformanceSummary(): {
    totalToolCalls: number;
    totalSessions: number;
    avgToolCallDuration: number;
    topSlowestTools: Array<{ toolName: string; avgDuration: number }>;
    topFailingTools: Array<{ toolName: string; failureRate: number }>;
  } {
    let totalCalls = 0;
    let totalDuration = 0;
    const toolDurations: Array<{ toolName: string; avgDuration: number }> = [];
    const toolFailures: Array<{ toolName: string; failureRate: number }> = [];

    for (const stats of this.toolStats.values()) {
      totalCalls += stats.callCount;
      totalDuration += stats.totalDuration;
      toolDurations.push({ toolName: stats.toolName, avgDuration: stats.avgDuration });
      if (stats.failureCount > 0) {
        toolFailures.push({
          toolName: stats.toolName,
          failureRate: stats.failureCount / stats.callCount,
        });
      }
    }

    return {
      totalToolCalls: totalCalls,
      totalSessions: this.sessionStats.size,
      avgToolCallDuration: totalCalls > 0 ? totalDuration / totalCalls : 0,
      topSlowestTools: toolDurations.sort((a, b) => b.avgDuration - a.avgDuration).slice(0, 5),
      topFailingTools: toolFailures.sort((a, b) => b.failureRate - a.failureRate).slice(0, 5),
    };
  }

  /**
   * 清除统计数据
   */
  clearStats(): void {
    this.toolStats.clear();
    this.sessionStats.clear();
    this.pendingToolCalls.clear();
  }

  /**
   * 获取已注册的 Hook IDs
   */
  getRegisteredHookIds(): string[] {
    return [...this.registeredHookIds];
  }
}

/**
 * 创建监控 Hooks 实例
 */
export function createMonitoringHooks(
  registry: HookRegistry,
  config?: MonitoringHooksConfig
): MonitoringHooks {
  return new MonitoringHooks(registry, config);
}
