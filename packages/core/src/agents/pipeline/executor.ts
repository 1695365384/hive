/**
 * Pipeline 执行器
 *
 * 多阶段 Swarm 串行编排引擎。
 * 委托给 SwarmCapability 执行每个阶段，共享同一个 Blackboard。
 * 通过 nodeIdPrefix 实现阶段间节点 ID 隔离。
 */

import type {
  PipelineStage,
  PipelineOptions,
  PipelineResult,
  StageResult,
  PipelineTraceEvent,
} from './types.js';
import type { SwarmCapability } from '../capabilities/SwarmCapability.js';
import type { Blackboard } from '../swarm/blackboard.js';
import { Blackboard as BlackboardImpl } from '../swarm/blackboard.js';
import { evaluateTrigger } from './trigger.js';

/**
 * Pipeline 执行器
 */
export class PipelineExecutor {
  private readonly swarmCap: SwarmCapability;
  private readonly pipelineId: string;
  private readonly trace: PipelineTraceEvent[] = [];

  constructor(
    swarmCap: SwarmCapability,
    pipelineId?: string
  ) {
    this.swarmCap = swarmCap;
    this.pipelineId = pipelineId ?? `pl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * 执行 Pipeline
   */
  async execute(
    stages: PipelineStage[],
    task: string,
    options?: PipelineOptions
  ): Promise<PipelineResult> {
    const startTime = Date.now();

    this.recordTrace({
      type: 'pipeline.start',
      metadata: { task, stageCount: stages.length },
    });

    // 空 Pipeline
    if (stages.length === 0) {
      this.recordTrace({ type: 'pipeline.complete' });
      return {
        stages: [],
        success: true,
        text: '',
        duration: Date.now() - startTime,
        trace: [...this.trace],
      };
    }

    // 创建共享黑板
    const blackboard = new BlackboardImpl({
      maxLen: options?.blackboardMaxLen,
    });
    blackboard.set('task', task);

    const stageResults: StageResult[] = [];
    let lastText = '';
    let totalSuccess = true;
    let totalInput = 0;
    let totalOutput = 0;

    for (const stage of stages) {
      const result = await this.executeStage(
        stage,
        task,
        blackboard,
        stageResults,
        options
      );

      stageResults.push(result);

      if (result.executed && result.result) {
        lastText = result.result.text;
        totalInput += result.result.usage?.input ?? 0;
        totalOutput += result.result.usage?.output ?? 0;
        if (!result.result.success) {
          totalSuccess = false;
        }
      }

      options?.onStageComplete?.(result);
    }

    this.recordTrace({
      type: 'pipeline.complete',
      metadata: { success: totalSuccess },
    });

    return {
      stages: stageResults,
      success: totalSuccess,
      text: lastText,
      duration: Date.now() - startTime,
      usage: { input: totalInput, output: totalOutput },
      trace: [...this.trace],
    };
  }

  /**
   * 执行单个阶段
   */
  private async executeStage(
    stage: PipelineStage,
    task: string,
    blackboard: Blackboard,
    previousStages: StageResult[],
    options?: PipelineOptions
  ): Promise<StageResult> {
    const stageStartTime = Date.now();
    const trigger = stage.trigger ?? { type: 'always' as const };
    const variant = stage.templateVariant ?? 'medium';

    this.recordTrace({
      type: 'stage.start',
      stageName: stage.name,
      template: stage.templateName,
      variant,
    });

    options?.onPhase?.('stage-start', `Stage: ${stage.name} (${stage.templateName})`);

    // 处理 confirm 触发
    if (trigger.type === 'confirm') {
      const approved = await this.handleConfirm(trigger.message, options);
      if (!approved) {
        const duration = Date.now() - stageStartTime;
        this.recordTrace({
          type: 'stage.skipped',
          stageName: stage.name,
          template: stage.templateName,
          variant,
          skipReason: 'User rejected confirmation',
          duration,
        });
        options?.onPhase?.('stage-skipped', `Stage ${stage.name} skipped: user rejected`);
        return {
          stageName: stage.name,
          template: stage.templateName,
          variant,
          executed: false,
          skipReason: 'User rejected confirmation',
          duration,
        };
      }
    }

    // 评估触发条件
    const previousStage = previousStages[previousStages.length - 1];
    // onNodeFail 检查的是原始 nodeId（如 'fix'），但 nodeResults 的 key 带前缀（如 'try.fix'）
    // 映射回原始 nodeId 供 trigger 使用
    const prefix = previousStage?.stageName ? `${previousStage.stageName}.` : '';
    const rawNodeResults: Record<string, NodeResult> = {};
    if (previousStage?.result?.nodeResults) {
      for (const [key, value] of Object.entries(previousStage.result.nodeResults)) {
        const rawKey = prefix ? key.slice(prefix.length) : key;
        rawNodeResults[rawKey] = value;
      }
    }

    const context = {
      blackboard,
      nodeResults: rawNodeResults,
      previousStageName: previousStage?.stageName,
    };

    const shouldExecute = evaluateTrigger(trigger, context);

    if (!shouldExecute) {
      const duration = Date.now() - stageStartTime;
      this.recordTrace({
        type: 'stage.skipped',
        stageName: stage.name,
        template: stage.templateName,
        variant,
        skipReason: `Trigger condition not met (${trigger.type})`,
        duration,
      });
      options?.onPhase?.('stage-skipped', `Stage ${stage.name} skipped: trigger not met`);
      return {
        stageName: stage.name,
        template: stage.templateName,
        variant,
        executed: false,
        skipReason: `Trigger condition not met (${trigger.type})`,
        duration,
      };
    }

    // 委托给 SwarmCapability 执行，传入 nodeIdPrefix 实现阶段隔离
    const swarmResult = await this.swarmCap.runInternal(task, {
      template: stage.templateName,
      classify: false,
      nodeIdPrefix: stage.name,
      blackboard,
      cwd: options?.cwd,
      maxConcurrent: options?.maxConcurrent,
      onNodeComplete: options?.onNodeComplete,
    });

    const duration = Date.now() - stageStartTime;

    if (swarmResult.template === '_fallback_workflow') {
      this.recordTrace({
        type: 'stage.skipped',
        stageName: stage.name,
        template: stage.templateName,
        variant,
        skipReason: `Template not found: ${stage.templateName}`,
        duration,
      });
      return {
        stageName: stage.name,
        template: stage.templateName,
        variant,
        executed: false,
        skipReason: `Template not found: ${stage.templateName}`,
        duration,
      };
    }

    this.recordTrace({
      type: 'stage.complete',
      stageName: stage.name,
      template: swarmResult.template,
      variant: variant,
      duration,
      metadata: {
        success: swarmResult.success,
        nodeCount: Object.keys(swarmResult.nodeResults).length,
      },
    });

    options?.onPhase?.(
      'stage-complete',
      `Stage ${stage.name} complete (${swarmResult.success ? 'success' : 'failed'})`
    );

    return {
      stageName: stage.name,
      template: swarmResult.template,
      variant,
      executed: true,
      result: swarmResult,
      duration,
    };
  }

  /**
   * 处理 confirm 触发
   */
  private async handleConfirm(
    message: string,
    options?: PipelineOptions
  ): Promise<boolean> {
    if (options?.onConfirm) {
      return options.onConfirm(message);
    }
    // 默认行为：自动批准
    return true;
  }

  /**
   * 记录追踪事件
   */
  private recordTrace(event: Omit<PipelineTraceEvent, 'pipelineId' | 'timestamp'>): void {
    this.trace.push({
      ...event,
      pipelineId: this.pipelineId,
      timestamp: Date.now(),
    });
  }

  /**
   * 获取 Pipeline ID
   */
  getPipelineId(): string {
    return this.pipelineId;
  }
}
