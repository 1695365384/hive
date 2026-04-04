/**
 * 成本预算能力
 *
 * 管理 Agent 执行中的 LLM API 成本、预算限制和告警
 *
 * 核心功能:
 * - 实时成本追踪
 * - 每个工具的成本模型
 * - 按会话/任务的预算限制
 * - 动态成本告警和限流
 */

import type { AgentCapability, AgentContext } from '../types.js';
import type {
  ToolBeforeHookContext,
  ToolAfterHookContext,
  HookResult,
} from '../../hooks/types.js';

/**
 * 工具的成本模型
 */
export interface ToolCostModel {
  /** 工具名称 */
  toolName: string;

  /** API 调用的平均成本（美元）*/
  averageCost: number;

  /** 每个月的速率限制 */
  monthlyQuota?: number;

  /** 是否需要成本审计 */
  requiresCostAudit: boolean;
}

/**
 * 成本预算配置
 */
export interface CostBudgetConfig {
  /** 是否启用成本追踪 */
  enableCostTracking?: boolean;

  /** 每个会话的成本预算（美元） */
  sessionBudget?: number;

  /** 每个任务的成本预算（美元） */
  taskBudget?: number;

  /** 全局月度预算（美元） */
  monthlyBudget?: number;

  /** 成本警告阈值（占预算比例，如 0.8 = 80%） */
  warningThreshold?: number;

  /** 工具成本模型列表 */
  toolCostModels?: ToolCostModel[];

  /** 成本超限时的回调 */
  onBudgetExceeded?: (context: {
    sessionId: string;
    currentCost: number;
    budgetLimit: number;
    remainingBudget: number;
  }) => Promise<boolean>;

  /** 成本警告时的回调 */
  onCostWarning?: (context: {
    sessionId: string;
    currentCost: number;
    budgetLimit: number;
    percentageUsed: number;
  }) => Promise<void>;
}

/**
 * 成本预算能力实现
 */
export class CostBudgetCapability implements AgentCapability {
  readonly name = 'cost-budget';
  readonly version = '1.0.0';

  private context: AgentContext | null = null;
  private config: CostBudgetConfig;

  constructor(config?: CostBudgetConfig) {
    this.config = {
      enableCostTracking: true,
      sessionBudget: 100,
      taskBudget: 50,
      monthlyBudget: 1000,
      warningThreshold: 0.8,
      ...config,
    };
  }

  /**
   * 初始化能力
   */
  initialize(context: AgentContext): void {
    this.context = context;

    // 注册 Hook：在工具执行后追踪成本
    context.hookRegistry.on(
      'tool:after',
      this.handleToolAfter.bind(this),
      { priority: 'high' }
    );
  }

  /**
   * 销毁能力
   */
  dispose(): void {
    this.context = null;
  }

  /**
   * 工具执行后 - 成本追踪
   */
  private async handleToolAfter(
    ctx: ToolAfterHookContext
  ): Promise<HookResult> {
    if (!this.config.enableCostTracking) {
      return { proceed: true };
    }

    // 估算工具成本
    const toolCost = await this.estimateToolCost(ctx.toolName, ctx.output);

    if (toolCost > 0) {
      // 更新会话成本记录
      await this.recordCost({
        sessionId: ctx.sessionId,
        toolName: ctx.toolName,
        cost: toolCost,
      });

      // 检查预算
      const remaining = await this.getRemainingBudget(ctx.sessionId);
      if (remaining < 0) {
        // 预算超限
        const allowed = await this.config.onBudgetExceeded?.({
          sessionId: ctx.sessionId,
          currentCost: await this.getSessionCost(ctx.sessionId),
          budgetLimit: this.config.sessionBudget || 0,
          remainingBudget: remaining,
        });

        if (!allowed) {
          return {
            proceed: false,
            error: new Error('Session cost budget exceeded'),
          };
        }
      } else if (remaining > 0 && remaining < (this.config.sessionBudget || 0) * 0.2) {
        // 预算即将用尽 (< 20% 剩余)
        await this.config.onCostWarning?.({
          sessionId: ctx.sessionId,
          currentCost: await this.getSessionCost(ctx.sessionId),
          budgetLimit: this.config.sessionBudget || 0,
          percentageUsed: 1 - (remaining / (this.config.sessionBudget || 1)),
        });
      }
    }

    return { proceed: true };
  }

  /**
   * 估算工具的成本
   */
  private async estimateToolCost(toolName: string, output?: unknown): Promise<number> {
    const model = this.config.toolCostModels?.find(m => m.toolName === toolName);

    if (model) {
      return model.averageCost;
    }

    // 默认成本模型
    const defaultCosts: Record<string, number> = {
      'web-search': 0.001,
      'read-file': 0,
      'write-file': 0.0005,
      'grep-search': 0,
      'run-command': 0.0001,
      'git-push': 0.001,
      'delete-file': 0.0001,
    };

    return defaultCosts[toolName] || 0;
  }

  /**
   * 记录成本
   */
  private async recordCost(record: {
    sessionId: string;
    toolName: string;
    cost: number;
  }): Promise<void> {
    // TODO: 实现成本记录到数据库或内存缓存
    console.debug(`[cost-budget] Tool: ${record.toolName}, Cost: $${record.cost}`);
  }

  /**
   * 获取会话的累计成本
   */
  private async getSessionCost(sessionId: string): Promise<number> {
    // TODO: 从审计日志中计算成本
    return 0;
  }

  /**
   * 获取剩余预算
   */
  private async getRemainingBudget(sessionId: string): Promise<number> {
    const spent = await this.getSessionCost(sessionId);
    return (this.config.sessionBudget || 0) - spent;
  }
}
