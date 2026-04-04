/**
 * 权限能力 - PermissionCapability
 *
 * 实现工具调用的权限管理、拦截和决策
 * 与 Hook 系统集成，在工具执行前进行权限检查
 */

import { randomUUID } from 'crypto';
import type { AgentCapability, AgentContext } from '../core/types.js';
import type { ToolBeforeHookContext } from '../../hooks/types.js';
import type { HookResult } from '../../hooks/types.js';
import type { AuditLogEntry, IAuditLogRepository } from '../../tools/audit-types.js';
import {
  getToolPermissionLevel,
  getToolDescription,
  requiresUserConfirmation,
  requiresAuditLogging,
  type ToolPermissionLevel,
} from '../../tools/permissions.js';

/**
 * 权限能力配置
 */
export interface PermissionCapabilityConfig {
  /** 审计日志仓库 */
  auditRepository?: IAuditLogRepository | null;

  /** 是否启用权限检查 (默认 true) */
  enablePermissionCheck?: boolean;

  /** 是否启用审计日志 (默认 true) */
  enableAuditLogging?: boolean;

  /** 用户确认回调 (用于处理需要确认的工具) */
  onUserConfirmationRequired?: (input: UserConfirmationInput) => Promise<boolean>;

  /** 权限拒绝回调 */
  onPermissionDenied?: (input: PermissionDeniedInput) => Promise<void>;
}

/**
 * 用户确认输入
 */
export interface UserConfirmationInput {
  toolName: string;
  description: string;
  input: unknown;
  sessionId: string;
}

/**
 * 权限拒绝输入
 */
export interface PermissionDeniedInput {
  toolName: string;
  reason: string;
  sessionId: string;
}

/**
 * PermissionCapability 实现
 */
export class PermissionCapability implements AgentCapability {
  readonly name = 'permission';

  private context!: AgentContext;
  private config: PermissionCapabilityConfig;
  private auditRepository: IAuditLogRepository | null;

  constructor(config?: PermissionCapabilityConfig) {
    this.config = config || {};
    this.auditRepository = config?.auditRepository || null;
  }

  /**
   * 初始化能力
   */
  initialize(context: AgentContext): void {
    this.context = context;

    // 注册 Hook：在工具执行前进行权限检查
    context.hookRegistry.on(
      'tool:before',
      this.handleToolBefore.bind(this),
      { priority: 'highest' } // 最高优先级，在任何其他 Hook 之前执行
    );
  }

  /**
   * 清理资源
   */
  dispose(): void {
    // cleanup
  }

  // =========================================
  // Hook 处理器
  // =========================================

  /**
   * 工具执行前的权限检查
   */
  private async handleToolBefore(
    ctx: ToolBeforeHookContext
  ): Promise<HookResult> {
    if (this.config.enablePermissionCheck === false) {
      return { proceed: true };
    }

    const toolName = ctx.toolName;
    const permission = getToolPermissionLevel(toolName);

    // 🟢 SAFE: 直接通过
    if (permission === 'safe') {
      if (this.config.enableAuditLogging && this.auditRepository) {
        await this.logAudit({
          toolName,
          permission,
          toolInput: ctx.input,
          decision: 'allowed',
          decisionReason: 'Safe tool - automatic approval',
          sessionId: ctx.sessionId,
          executionStatus: 'success', // 仅记录决策，实际执行由后续处理
        });
      }
      return { proceed: true };
    }

    // 🟡 RESTRICTED: 记录审计日志并通过
    if (permission === 'restricted') {
      if (this.config.enableAuditLogging && this.auditRepository) {
        await this.logAudit({
          toolName,
          permission,
          toolInput: ctx.input,
          decision: 'allowed',
          decisionReason: 'Restricted tool - automatic logging',
          sessionId: ctx.sessionId,
          executionStatus: 'success',
        });
      }
      return { proceed: true };
    }

    // 🔴 DANGEROUS: 需要人工确认
    if (permission === 'dangerous') {
      const description = getToolDescription(toolName);

      // 调用用户确认回调
      const confirmed = await this.config.onUserConfirmationRequired?.({
        toolName,
        description,
        input: ctx.input,
        sessionId: ctx.sessionId,
      });

      if (!confirmed) {
        // 用户拒绝
        await this.config.onPermissionDenied?.({
          toolName,
          reason: 'User rejected dangerous tool execution',
          sessionId: ctx.sessionId,
        });

        if (this.config.enableAuditLogging && this.auditRepository) {
          await this.logAudit({
            toolName,
            permission,
            toolInput: ctx.input,
            decision: 'denied',
            decisionReason: 'User rejected after confirmation',
            sessionId: ctx.sessionId,
            executionStatus: 'blocked',
          });
        }

        return {
          proceed: false,
          error: new Error(`User rejected execution of dangerous tool: ${toolName}`),
        };
      }

      // 用户确认
      if (this.config.enableAuditLogging && this.auditRepository) {
        await this.logAudit({
          toolName,
          permission,
          toolInput: ctx.input,
          decision: 'user_confirmed',
          decisionReason: 'User confirmed after prompt',
          userConfirmedAt: new Date(),
          sessionId: ctx.sessionId,
          executionStatus: 'success',
        });
      }

      return { proceed: true };
    }

    return { proceed: true };
  }

  // =========================================
  // 审计日志方法
  // =========================================

  /**
   * 记录审计日志
   */
  private async logAudit(data: {
    toolName: string;
    permission: ToolPermissionLevel;
    toolInput: unknown;
    decision: 'allowed' | 'denied' | 'user_confirmed';
    decisionReason: string;
    sessionId: string;
    executionStatus: 'success' | 'failed' | 'blocked';
    userConfirmedAt?: Date;
  }): Promise<void> {
    if (!this.auditRepository) {
      return;
    }

    const entry: AuditLogEntry = {
      id: `audit_${Date.now()}_${randomUUID().slice(0, 8)}`,
      sessionId: data.sessionId,
      timestamp: new Date(),
      toolName: data.toolName,
      toolPermission: data.permission,
      toolInput: JSON.stringify(data.toolInput),
      decision: data.decision,
      decisionReason: data.decisionReason,
      userConfirmedAt: data.userConfirmedAt,
      executionStatus: data.executionStatus,
    };

    await this.auditRepository.save(entry);
  }

  /**
   * 获取会话的审计日志
   */
  async getAuditLogs(sessionId: string, limit?: number): Promise<AuditLogEntry[]> {
    if (!this.auditRepository) {
      return [];
    }

    return this.auditRepository.query({ sessionId, limit });
  }

  /**
   * 获取审计统计信息
   */
  async getAuditStats(sessionId: string) {
    if (!this.auditRepository) {
      return null;
    }

    return this.auditRepository.getStats(sessionId);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PermissionCapabilityConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
