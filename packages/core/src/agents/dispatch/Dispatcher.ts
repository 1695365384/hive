/**
 * Dispatcher - 智能任务分发器
 *
 * LLM 分类 + 正则 fallback，将任务路由到 chat 或 workflow。
 */

import type { AgentContext } from '../core/types.js';
import type {
  DispatchClassification,
  DispatchOptions,
  DispatchResult,
  DispatchTraceEvent,
  ExecutionLayer,
} from './types.js';
import type { WorkflowCapability } from '../capabilities/WorkflowCapability.js';
import type { SessionCapability } from '../capabilities/SessionCapability.js';
import { classifyForDispatch, regexClassify } from './classifier.js';
import { getModelPricing } from '../../providers/metadata/pricing.js';

const VALID_LAYERS: ReadonlySet<string> = new Set(['chat', 'workflow']);

// ============================================
// Dispatcher
// ============================================

/**
 * 智能任务分发器
 */
export class Dispatcher {
  private context: AgentContext;

  constructor(context: AgentContext) {
    this.context = context;
  }

  /**
   * 分发任务到合适的执行层
   */
  async dispatch(task: string, options?: DispatchOptions): Promise<DispatchResult> {
    const startTime = Date.now();
    const trace: DispatchTraceEvent[] = [];

    trace.push({
      timestamp: Date.now(),
      type: 'dispatch.start',
    });

    // 空任务快速返回
    if (!task?.trim()) {
      return {
        layer: 'chat',
        classification: { layer: 'chat', taskType: 'general', complexity: 'simple', confidence: 0, reason: 'Empty task' },
        text: '',
        success: false,
        duration: Date.now() - startTime,
        error: 'Task is empty',
        trace,
      };
    }

    // Step 1: 分类
    let classification: DispatchClassification;

    if (options?.forceLayer) {
      const layer = VALID_LAYERS.has(options.forceLayer)
        ? (options.forceLayer as ExecutionLayer)
        : 'chat';
      classification = {
        layer,
        taskType: 'general',
        complexity: 'moderate',
        confidence: 1.0,
        reason: `Forced layer: ${options.forceLayer}`,
      };
    } else {
      classification = await this.classify(task, options, trace);
    }

    trace.push({
      timestamp: Date.now(),
      type: 'dispatch.route',
      layer: classification.layer,
      confidence: classification.confidence,
      reason: classification.reason,
    });

    // Step 2: 路由
    try {
      let result: DispatchResult;

      switch (classification.layer) {
        case 'workflow':
          result = await this.executeWorkflow(task, classification, startTime, options);
          break;
        case 'chat':
        default:
          result = await this.executeChat(task, classification, startTime, options);
          break;
      }

      trace.push({
        timestamp: Date.now(),
        type: 'dispatch.complete',
        layer: result.layer,
        duration: result.duration,
      });

      return { ...result, trace };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      if (classification.layer === 'chat') {
        throw error;
      }

      trace.push({
        timestamp: Date.now(),
        type: 'dispatch.fallback',
        fallbackFrom: classification.layer,
        reason: errMsg,
      });

      options?.onPhase?.('fallback', `Routing failed, falling back to chat: ${errMsg}`);

      try {
        return { ...(await this.executeChat(task, classification, startTime, options)), trace };
      } catch (chatError) {
        return {
          layer: 'chat',
          classification,
          text: '',
          success: false,
          duration: Date.now() - startTime,
          error: chatError instanceof Error ? chatError.message : String(chatError),
          trace,
        };
      }
    } finally {
      // 持久化 trace 到 SessionManager（best-effort）
      if (trace.length > 0) {
        try {
          const sessionCap = this.context.getSessionCap?.();
          if (sessionCap) {
            await sessionCap.saveTrace(trace);
          }
        } catch {
          // trace persistence is best-effort
        }
      }
    }
  }

  // ============================================
  // 分类
  // ============================================

  private async classify(
    task: string,
    options: DispatchOptions | undefined,
    trace: DispatchTraceEvent[]
  ): Promise<DispatchClassification> {
    const threshold = Math.max(0, Math.min(1, options?.confidenceThreshold ?? 0.5));

    try {
      const { classification, trace: classifyTrace } = await classifyForDispatch(
        task,
        {
          getActiveProvider: () => {
            const provider = this.context.getActiveProvider();
            return provider ? { baseUrl: provider.baseUrl, apiKey: provider.apiKey } : null;
          },
          getModel: (modelId?: string) => this.context.providerManager.getModel(modelId),
        },
        options?.classifierModel
      );

      trace.push(...classifyTrace);

      if (classification.confidence >= threshold) {
        return classification;
      }

      options?.onPhase?.('classify', `LLM confidence low (${classification.confidence}), using regex fallback`);
      return regexClassify(task);
    } catch (error) {
      console.debug(`[dispatcher] LLM classification failed, using regex fallback: ${error instanceof Error ? error.message : error}`);
      return regexClassify(task);
    }
  }

  // ============================================
  // 执行层
  // ============================================

  private async executeChat(
    task: string,
    classification: DispatchClassification,
    startTime: number,
    options: DispatchOptions | undefined,
  ): Promise<DispatchResult> {
    options?.onPhase?.('execute', 'Executing chat...');

    const chatCap = this.context.getCapability<import('../capabilities/ChatCapability.js').ChatCapability>('chat');
    if (!chatCap) {
      return {
        layer: 'chat',
        classification,
        text: '',
        success: false,
        duration: Date.now() - startTime,
        error: 'Chat capability not available',
      };
    }
    const text = await chatCap.send(task, {
      cwd: options?.cwd,
      onText: options?.onText,
      onTool: options?.onTool,
    });

    const modelId = this.context.getActiveProvider()?.model;
    return {
      layer: 'chat',
      classification,
      text,
      success: true,
      duration: Date.now() - startTime,
      cost: this.calculateCost(undefined, modelId),
    };
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
    // pricing is per 1M tokens, usage is in tokens
    const inputCost = (usage.input / 1_000_000) * pricing.input;
    const outputCost = (usage.output / 1_000_000) * pricing.output;
    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
    };
  }

  private async executeWorkflow(
    task: string,
    classification: DispatchClassification,
    startTime: number,
    options: DispatchOptions | undefined,
  ): Promise<DispatchResult> {
    options?.onPhase?.('execute', 'Executing workflow...');

    const workflowCap = this.context.getCapability<WorkflowCapability>('workflow');
    if (!workflowCap) {
      return {
        layer: 'workflow',
        classification,
        text: '',
        success: false,
        duration: Date.now() - startTime,
        error: 'Workflow capability not available',
      };
    }

    const result = await workflowCap.run(task, {
      cwd: options?.cwd,
      onPhase: options?.onPhase,
      onText: options?.onText,
      onTool: options?.onTool,
    });

    const modelId = this.context.getActiveProvider()?.model;

    return {
      layer: 'workflow',
      classification,
      text: result.executeResult?.text ?? result.exploreResult?.text ?? '',
      success: result.success,
      duration: Date.now() - startTime,
      usage: result.executeResult?.usage,
      cost: this.calculateCost(result.executeResult?.usage, modelId),
      error: result.error,
      analysis: result.analysis,
      exploreResult: result.exploreResult,
      executionPlan: result.executionPlan,
      executeResult: result.executeResult,
    };
  }
}
