/**
 * Pipeline 执行器
 *
 * 多阶段 Swarm 串行编排引擎。
 * 所有阶段共享同一个 Blackboard，节点 ID 使用阶段前缀避免冲突。
 */

import type {
  PipelineStage,
  PipelineOptions,
  PipelineResult,
  StageResult,
  PipelineTraceEvent,
} from './types.js';
import type { TriggerContext } from './trigger.js';
import type { SwarmResult, SwarmOptions, NodeResult, TemplateVariant } from '../swarm/types.js';
import type { SwarmTemplate } from '../swarm/types.js';
import type { AgentRunner } from '../core/runner.js';
import { Blackboard } from '../swarm/blackboard.js';
import { SwarmTracer } from '../swarm/tracer.js';
import {
  matchTemplate,
  matchTemplateDetailed,
  buildGraph,
} from '../swarm/decomposer.js';
import { SwarmExecutor } from '../swarm/executor.js';
import { aggregate, sumUsage } from '../swarm/aggregator.js';
import { evaluateTrigger } from './trigger.js';

/**
 * Pipeline 执行器
 */
export class PipelineExecutor {
  private readonly runner: AgentRunner;
  private readonly templates: SwarmTemplate[];
  private readonly pipelineId: string;
  private readonly trace: PipelineTraceEvent[] = [];

  constructor(
    runner: AgentRunner,
    templates: SwarmTemplate[],
    pipelineId?: string
  ) {
    this.runner = runner;
    this.templates = templates;
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

    // 共享黑板
    const blackboard = new Blackboard({
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

      if (result.executed) {
        if (result.result) {
          lastText = result.result.text;
          totalInput += result.result.usage?.input ?? 0;
          totalOutput += result.result.usage?.output ?? 0;
        }
        if (result.result && !result.result.success) {
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

    // 评估触发条件（confirm 通过后也需评估，但 confirm 本身返回 true）
    const previousStage = previousStages[previousStages.length - 1];
    const context: TriggerContext = {
      blackboard,
      nodeResults: previousStage?.result?.nodeResults ?? {},
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

    // 匹配模板
    const matchResult = matchTemplateDetailed(task, this.templates, {
      templateName: stage.templateName,
      variant,
    });

    if (!matchResult) {
      const duration = Date.now() - stageStartTime;
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

    const template = matchResult.template;

    // 创建阶段专属的 tracer
    const tracer = new SwarmTracer();

    // 构建 DAG
    const graph = buildGraph(template, blackboard, tracer);

    options?.onPhase?.('execute', `Executing stage ${stage.name}`);

    // 执行 Swarm
    try {
      const swarmOptions: SwarmOptions = {
        cwd: options?.cwd,
        maxConcurrent: options?.maxConcurrent,
        blackboardMaxLen: options?.blackboardMaxLen,
        classify: false,
        onNodeComplete: options?.onNodeComplete,
      };

      const executor = new SwarmExecutor(this.runner, swarmOptions);
      const nodeResultsEntries = await executor.execute(graph, blackboard, tracer);

      // 聚合结果
      const nodeResultsMap = new Map(Object.entries(
        Object.fromEntries(nodeResultsEntries)
      ) as [string, NodeResult][]);

      const { text, success, error } = aggregate(
        graph.aggregate,
        nodeResultsMap,
        graph.terminalNodes
      );

      const usage = sumUsage(nodeResultsMap);
      const duration = Date.now() - stageStartTime;

      this.recordTrace({
        type: 'stage.complete',
        stageName: stage.name,
        template: template.name,
        variant: template.variant ?? 'medium',
        duration,
        metadata: { success, nodeCount: Object.keys(graph.nodes).length },
      });

      options?.onPhase?.('stage-complete', `Stage ${stage.name} complete (${success ? 'success' : 'failed'})`);

      const swarmResult: SwarmResult = {
        text,
        success,
        template: template.name,
        nodeResults: Object.fromEntries(nodeResultsMap),
        trace: [...tracer.getEvents()],
        duration,
        usage,
        error,
      };

      return {
        stageName: stage.name,
        template: template.name,
        variant: template.variant ?? 'medium',
        executed: true,
        result: swarmResult,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - stageStartTime;
      const errMsg = error instanceof Error ? error.message : String(error);

      this.recordTrace({
        type: 'stage.complete',
        stageName: stage.name,
        template: template.name,
        variant: template.variant ?? 'medium',
        duration,
        metadata: { success: false, error: errMsg },
      });

      return {
        stageName: stage.name,
        template: template.name,
        variant: template.variant ?? 'medium',
        executed: true,
        result: {
          text: '',
          success: false,
          template: template.name,
          nodeResults: {},
          trace: [...tracer.getEvents()],
          duration,
          error: errMsg,
        },
        duration,
      };
    }
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

    // 默认行为：自动批准（没有 onConfirm 回调时）
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
