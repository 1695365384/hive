/**
 * 审计 Hooks
 *
 * 提供：
 * - 操作审计
 * - 合规检查
 * - 数据访问追踪
 * - 审计日志记录
 */

import {
  type HookRegistry,
  type HookPriority,
  type ToolBeforeHookContext,
  type ToolAfterHookContext,
  type SessionStartHookContext,
  type SessionEndHookContext,
  type SessionErrorHookContext,
  type HookResult,
} from '../index.js';

/**
 * 审计日志级别
 */
export type AuditLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  /** 唯一 ID */
  id: string;
  /** 时间戳 */
  timestamp: Date;
  /** 日志级别 */
  level: AuditLogLevel;
  /** 事件类型 */
  eventType: string;
  /** 会话 ID */
  sessionId: string;
  /** 用户 ID（可选） */
  userId?: string;
  /** 工具名称（可选） */
  toolName?: string;
  /** 操作描述 */
  description: string;
  /** 详细数据 */
  data: Record<string, unknown>;
  /** 来源 IP（可选） */
  sourceIp?: string;
  /** 用户代理（可选） */
  userAgent?: string;
  /** 相关资源（可选） */
  resources?: string[];
  /** 结果状态 */
  result?: 'success' | 'failure' | 'blocked';
}

/**
 * 审计配置
 */
export interface AuditHooksConfig {
  /** 是否启用审计 */
  enabled?: boolean;
  /** 最小日志级别 */
  minLogLevel?: AuditLogLevel;
  /** 是否记录工具调用 */
  logToolCalls?: boolean;
  /** 是否记录会话事件 */
  logSessionEvents?: boolean;
  /** 是否记录错误 */
  logErrors?: boolean;
  /** 敏感字段列表（需要脱敏） */
  sensitiveFields?: string[];
  /** 审计日志处理器 */
  onAuditLog?: (entry: AuditLogEntry) => void | Promise<void>;
  /** 批量日志处理器 */
  onBatchLogs?: (entries: AuditLogEntry[]) => void | Promise<void>;
  /** 批量大小 */
  batchSize?: number;
  /** 批量刷新间隔（毫秒） */
  batchFlushInterval?: number;
}

/**
 * 审计 Hooks 实现
 */
export class AuditHooks {
  private registry: HookRegistry;
  private config: Required<Pick<AuditHooksConfig, 'enabled' | 'minLogLevel' | 'logToolCalls' | 'logSessionEvents' | 'logErrors' | 'batchSize' | 'batchFlushInterval' | 'sensitiveFields'>> & AuditHooksConfig;
  private registeredHookIds: string[] = [];
  private logBuffer: AuditLogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private entryCounter: number = 0;

  // 日志级别数值映射
  private static readonly LOG_LEVEL_VALUES: Record<AuditLogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    critical: 4,
  };

  constructor(registry: HookRegistry, config: AuditHooksConfig = {}) {
    this.registry = registry;
    this.config = {
      enabled: config.enabled ?? true,
      minLogLevel: config.minLogLevel ?? 'info',
      logToolCalls: config.logToolCalls ?? true,
      logSessionEvents: config.logSessionEvents ?? true,
      logErrors: config.logErrors ?? true,
      sensitiveFields: config.sensitiveFields ?? ['password', 'apiKey', 'secret', 'token', 'credential'],
      batchSize: config.batchSize ?? 100,
      batchFlushInterval: config.batchFlushInterval ?? 5000,
      ...config,
    };

    // 启动批量刷新定时器
    if (this.config.onBatchLogs) {
      this.startBatchFlushTimer();
    }
  }

  /**
   * 注册所有审计 Hooks
   */
  register(priority: HookPriority = 'normal'): void {
    if (!this.config.enabled) return;

    // 注册会话开始 Hook
    if (this.config.logSessionEvents) {
      let id = this.registry.on(
        'session:start',
        this.handleSessionStart.bind(this),
        { priority, description: '审计 - 会话开始' }
      );
      this.registeredHookIds.push(id);

      // 注册会话结束 Hook
      id = this.registry.on(
        'session:end',
        this.handleSessionEnd.bind(this),
        { priority, description: '审计 - 会话结束' }
      );
      this.registeredHookIds.push(id);
    }

    // 注册错误 Hook
    if (this.config.logErrors) {
      const id = this.registry.on(
        'session:error',
        this.handleSessionError.bind(this),
        { priority, description: '审计 - 会话错误' }
      );
      this.registeredHookIds.push(id);
    }

    // 注册工具调用 Hook
    if (this.config.logToolCalls) {
      let id = this.registry.on(
        'tool:before',
        this.handleToolBefore.bind(this),
        { priority, description: '审计 - 工具调用开始' }
      );
      this.registeredHookIds.push(id);

      id = this.registry.on(
        'tool:after',
        this.handleToolAfter.bind(this),
        { priority, description: '审计 - 工具调用结束' }
      );
      this.registeredHookIds.push(id);
    }
  }

  /**
   * 注销所有审计 Hooks
   */
  unregister(): void {
    for (const id of this.registeredHookIds) {
      this.registry.off(id);
    }
    this.registeredHookIds = [];

    // 停止批量刷新定时器
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // 刷新剩余日志
    this.flushBatch();
  }

  // ============================================
  // Hook 处理器
  // ============================================

  /**
   * 处理会话开始
   */
  private async handleSessionStart(context: SessionStartHookContext): Promise<HookResult> {
    this.log({
      level: 'info',
      eventType: 'session:start',
      sessionId: context.sessionId,
      description: '会话开始',
      data: {
        prompt: context.prompt ? this.sanitize(context.prompt) : undefined,
        metadata: context.metadata,
      },
    });

    return { proceed: true };
  }

  /**
   * 处理会话结束
   */
  private async handleSessionEnd(context: SessionEndHookContext): Promise<HookResult> {
    this.log({
      level: context.success ? 'info' : 'warn',
      eventType: 'session:end',
      sessionId: context.sessionId,
      description: `会话结束: ${context.success ? '成功' : '失败'}`,
      result: context.success ? 'success' : 'failure',
      data: {
        success: context.success,
        reason: context.reason,
        duration: context.duration,
      },
    });

    return { proceed: true };
  }

  /**
   * 处理会话错误
   */
  private async handleSessionError(context: SessionErrorHookContext): Promise<HookResult> {
    this.log({
      level: 'error',
      eventType: 'session:error',
      sessionId: context.sessionId,
      description: `会话错误: ${context.error.message}`,
      result: 'failure',
      data: {
        error: context.error.message,
        stack: context.error.stack,
        recoverable: context.recoverable,
      },
    });

    return { proceed: true };
  }

  /**
   * 处理工具调用开始
   */
  private async handleToolBefore(context: ToolBeforeHookContext): Promise<HookResult> {
    this.log({
      level: 'debug',
      eventType: 'tool:before',
      sessionId: context.sessionId,
      toolName: context.toolName,
      description: `工具调用开始: ${context.toolName}`,
      data: {
        input: this.sanitize(context.input),
      },
    });

    return { proceed: true };
  }

  /**
   * 处理工具调用结束
   */
  private async handleToolAfter(context: ToolAfterHookContext): Promise<HookResult> {
    this.log({
      level: context.success ? 'info' : 'warn',
      eventType: 'tool:after',
      sessionId: context.sessionId,
      toolName: context.toolName,
      description: `工具调用结束: ${context.toolName} (${context.success ? '成功' : '失败'})`,
      result: context.success ? 'success' : 'failure',
      data: {
        duration: context.duration,
        output: context.success ? this.sanitizeOutput(context.output) : undefined,
        error: context.error?.message,
      },
    });

    return { proceed: true };
  }

  // ============================================
  // 日志方法
  // ============================================

  /**
   * 记录审计日志
   */
  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    // 检查日志级别
    if (!this.shouldLog(entry.level)) {
      return;
    }

    const fullEntry: AuditLogEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date(),
    };

    // 单条日志处理
    if (this.config.onAuditLog) {
      Promise.resolve(this.config.onAuditLog(fullEntry)).catch(console.error);
    }

    // 批量日志处理
    if (this.config.onBatchLogs) {
      this.logBuffer.push(fullEntry);
      if (this.logBuffer.length >= (this.config.batchSize || 100)) {
        this.flushBatch();
      }
    }
  }

  /**
   * 手动记录审计事件
   */
  recordEvent(
    eventType: string,
    sessionId: string,
    description: string,
    data: Record<string, unknown> = {},
    options: {
      level?: AuditLogLevel;
      toolName?: string;
      userId?: string;
      result?: 'success' | 'failure' | 'blocked';
    } = {}
  ): void {
    this.log({
      level: options.level || 'info',
      eventType,
      sessionId,
      description,
      data,
      toolName: options.toolName,
      userId: options.userId,
      result: options.result,
    });
  }

  /**
   * 检查是否应该记录该级别的日志
   */
  private shouldLog(level: AuditLogLevel): boolean {
    const minLevelValue = AuditHooks.LOG_LEVEL_VALUES[this.config.minLogLevel];
    const levelValue = AuditHooks.LOG_LEVEL_VALUES[level];
    return levelValue >= minLevelValue;
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `audit_${Date.now()}_${++this.entryCounter}`;
  }

  /**
   * 脱敏处理
   */
  private sanitize(data: unknown): unknown {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitize(item));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (this.config.sensitiveFields.some(field =>
        key.toLowerCase().includes(field.toLowerCase())
      )) {
        result[key] = '***REDACTED***';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.sanitize(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * 脱敏输出（截断长输出）
   */
  private sanitizeOutput(output: unknown): unknown {
    if (typeof output === 'string' && output.length > 500) {
      return output.slice(0, 500) + '...[truncated]';
    }
    return this.sanitize(output);
  }

  // ============================================
  // 批量处理
  // ============================================

  /**
   * 启动批量刷新定时器
   */
  private startBatchFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushBatch();
    }, this.config.batchFlushInterval);
  }

  /**
   * 刷新批量日志
   */
  flushBatch(): void {
    if (this.logBuffer.length === 0 || !this.config.onBatchLogs) {
      return;
    }

    const entries = [...this.logBuffer];
    this.logBuffer = [];

    Promise.resolve(this.config.onBatchLogs(entries)).catch(console.error);
  }

  /**
   * 获取缓冲区大小
   */
  getBufferSize(): number {
    return this.logBuffer.length;
  }

  /**
   * 获取已注册的 Hook IDs
   */
  getRegisteredHookIds(): string[] {
    return [...this.registeredHookIds];
  }
}

/**
 * 创建审计 Hooks 实例
 */
export function createAuditHooks(
  registry: HookRegistry,
  config?: AuditHooksConfig
): AuditHooks {
  return new AuditHooks(registry, config);
}
