/**
 * Dispatcher - 统一任务执行器
 *
 * 直接调用 WorkflowCapability 执行任务，无分类/路由开销。
 */

import type { AgentContext } from '../core/types.js';
import type {
  DispatchOptions,
  DispatchResult,
  DispatchTraceEvent,
} from './types.js';
import type { WorkflowCapability } from '../capabilities/WorkflowCapability.js';
import { getModelPricing } from '../../providers/metadata/pricing.js';

// ============================================
// Dispatcher
// ============================================

/**
 * 统一任务执行器
 */
export class Dispatcher {
  private context: AgentContext;

  constructor(context: AgentContext) {
    this.context = context;
  }

  /**
   * 执行任务
   */
  async dispatch(task: string, options?: DispatchOptions): Promise<DispatchResult> {
    const startTime = Date.now();
    const trace: DispatchTraceEvent[] = [];

    trace.push({ timestamp: Date.now(), type: 'dispatch.start' });

    // 空任务快速返回
    if (!task?.trim()) {
      return {
        text: '',
        success: false,
        duration: Date.now() - startTime,
        error: 'Task is empty',
        tools: [],
        trace,
      };
    }

    // 确保 session 已切换到正确的 chatId
    await this.ensureSession(options?.chatId);

    try {
      const workflowCap = this.context.getCapability<WorkflowCapability>('workflow');
      if (!workflowCap) {
        return {
          text: '',
          success: false,
          duration: Date.now() - startTime,
          error: 'Workflow capability not available',
          tools: [],
          trace,
        };
      }

      const result = await workflowCap.run(task, {
        cwd: options?.cwd,
        onPhase: options?.onPhase,
        onText: options?.onText,
        onTool: options?.onTool,
        onToolResult: options?.onToolResult,
      });

      // 持久化对话到 session
      if (result.success && result.text) {
        await this.persistSession(task, result.text);
      }

      const modelId = this.context.getActiveProvider()?.model;

      trace.push({
        timestamp: Date.now(),
        type: 'dispatch.complete',
        duration: result.duration,
      });

      return {
        text: result.text,
        success: result.success,
        duration: Date.now() - startTime,
        tools: result.tools,
        cost: this.calculateCost(result.usage, modelId),
        error: result.error,
        trace,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      return {
        text: '',
        success: false,
        duration: Date.now() - startTime,
        error: errMsg,
        tools: [],
        trace,
      };
    } finally {
      // 持久化 trace 到 SessionManager（best-effort）
      if (trace.length > 0) {
        try {
          const sessionCap = this.context.getSessionCap?.();
          if (sessionCap) {
            await sessionCap.saveTrace(trace);
          }
        } catch (traceError) {
          // trace persistence is best-effort; failures must not break the dispatch flow
          console.debug('[dispatch] Failed to persist trace:', traceError);
        }
      }
    }
  }

  // ============================================
  // Session 管理
  // ============================================

  /**
   * 确保正确的 session 已加载
   */
  private async ensureSession(chatId: string | undefined): Promise<void> {
    if (!chatId) return;

    const sessionCap = this.context.getSessionCap?.();
    if (!sessionCap) return;

    if (sessionCap.getCurrentSessionId() === chatId) return;

    const loaded = await sessionCap.loadSession(chatId);
    if (!loaded) {
      await sessionCap.createSession({ id: chatId });
    }
  }

  /**
   * 持久化对话到当前 session
   */
  private async persistSession(task: string, responseText: string): Promise<void> {
    const sessionCap = this.context.getSessionCap?.();
    if (!sessionCap) return;

    await sessionCap.addUserMessage(task);
    if (responseText) {
      await sessionCap.addAssistantMessage(responseText);
    }
  }

  // ============================================
  // Cost calculation
  // ============================================

  private calculateCost(
    usage: { input: number; output: number } | undefined,
    modelId: string | undefined,
  ): { input: number; output: number; total: number } | undefined {
    if (!usage || !modelId) {
      return undefined;
    }
    const pricing = getModelPricing(modelId);
    if (!pricing) {
      return undefined;
    }
    const inputCost = (usage.input / 1_000_000) * pricing.input;
    const outputCost = (usage.output / 1_000_000) * pricing.output;
    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
    };
  }
}
