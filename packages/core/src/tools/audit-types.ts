/**
 * 审计日志类型定义
 *
 * 记录所有工具调用、权限决策、用户确认等信息
 */

import type { ToolPermissionLevel } from './permissions.js';

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  /** 审计日志 ID */
  id: string;

  /** 会话 ID */
  sessionId: string;

  /** 时间戳 */
  timestamp: Date;

  /** 操作主体 - Agent ID */
  agentId?: string;

  /** 操作主体 - 用户 ID */
  userId?: string;

  // ========== 工具调用信息 ==========

  /** 工具名称 */
  toolName: string;

  /** 工具权限等级 */
  toolPermission: ToolPermissionLevel;

  /** 工具输入参数 (JSON 字符串) */
  toolInput: string;

  /** 工具输出结果 (JSON 字符串) */
  toolOutput?: string;

  // ========== 权限决策 ==========

  /** 决策结果: allowed | denied | user_confirmed */
  decision: 'allowed' | 'denied' | 'user_confirmed';

  /** 决策原因 */
  decisionReason?: string;

  /** 用户确认时是否展示的确认信息 */
  confirmationPrompt?: string;

  /** 用户确认时间 (仅当 decision = user_confirmed 时有效) */
  userConfirmedAt?: Date;

  // ========== 执行结果 ==========

  /** 执行状态: success | failed | blocked */
  executionStatus: 'success' | 'failed' | 'blocked';

  /** 执行错误信息 (仅当失败时) */
  executionError?: string;

  /** 执行耗时 (毫秒) */
  durationMs?: number;

  // ========== 成本信息 ==========

  /** 这个操作的成本影响 (美元) */
  costImpact?: number;

  // ========== 元数据 ==========

  /** 工作流阶段 (explore | plan | execute) */
  workflowPhase?: string;

  /** 任务 ID */
  taskId?: string;

  /** 备注 */
  remarks?: string;
}

/**
 * 审计日志统计信息
 */
export interface AuditLogStats {
  /** 总操作数 */
  totalActions: number;

  /** 按权限等级统计 */
  byPermission: {
    safe: number;
    restricted: number;
    dangerous: number;
  };

  /** 被拒绝的操作数 */
  deniedActions: number;

  /** 用户确认的危险操作数 */
  userConfirmedDangerous: number;

  /** 总成本影响 (美元) */
  totalCostImpact: number;

  /** 平均执行耗时 (毫秒) */
  avgExecutionDurationMs: number;
}

/**
 * 审计日志查询条件
 */
export interface AuditLogQuery {
  /** 会话 ID (可选) */
  sessionId?: string;

  /** 工具权限等级 (可选) */
  toolPermission?: ToolPermissionLevel;

  /** 决策结果 (可选) */
  decision?: 'allowed' | 'denied' | 'user_confirmed';

  /** 执行状态 (可选) */
  executionStatus?: 'success' | 'failed' | 'blocked';

  /** 时间范围 - 开始 */
  startTime?: Date;

  /** 时间范围 - 结束 */
  endTime?: Date;

  /** 分页 - 限制数 */
  limit?: number;

  /** 分页 - 偏移量 */
  offset?: number;

  /** 按工具名称搜索 */
  toolNameSearch?: string;
}

/**
 * 审计日志仓库接口
 */
export interface IAuditLogRepository {
  /**
   * 保存审计日志
   */
  save(entry: AuditLogEntry): Promise<void>;

  /**
   * 查询审计日志
   */
  query(conditions: AuditLogQuery): Promise<AuditLogEntry[]>;

  /**
   * 获取统计信息
   */
  getStats(sessionId: string): Promise<AuditLogStats>;

  /**
   * 删除过期日志 (超过指定天数)
   */
  deleteOlderThan(days: number): Promise<number>;
}
