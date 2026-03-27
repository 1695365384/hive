/**
 * 蜂群协作能力
 *
 * 规则驱动的多 Agent 协作引擎。
 * 通过模板匹配、DAG 分层并行执行、共享黑板、全链路追踪，
 * 实现确定性、可审计的多 Agent 协作。
 */

import type {
  AgentCapability,
  AgentContext,
  AgentResult,
} from '../core/types.js';
import type {
  SwarmTemplate,
  SwarmOptions,
  SwarmResult,
  SwarmPreview,
  NodeResult,
  TraceEvent,
} from '../swarm/types.js';
import { BUILTIN_TEMPLATES } from '../swarm/templates.js';
import {
  matchTemplate,
  matchTemplateDetailed,
  buildGraph,
} from '../swarm/decomposer.js';
import type { MatchTemplateOptions } from '../swarm/decomposer.js';
import { Blackboard } from '../swarm/blackboard.js';
import { SwarmTracer } from '../swarm/tracer.js';
import { SwarmExecutor } from '../swarm/executor.js';
import { aggregate, sumUsage } from '../swarm/aggregator.js';
import {
  classifyTask,
  createClassifierEvent,
  createLowConfidenceEvent,
} from '../swarm/classifier.js';

/**
 * 蜂群协作能力
 */
export class SwarmCapability implements AgentCapability {
  readonly name = 'swarm';
  private context!: AgentContext;
  private templates = new Map<string, SwarmTemplate>();

  initialize(context: AgentContext): void {
    this.context = context;
    // 注册内置模板
    for (const tpl of BUILTIN_TEMPLATES) {
      const key = tpl.variant
        ? `${tpl.name}:${tpl.variant}`
        : tpl.name;
      this.templates.set(key, tpl);
    }
  }

  // ============================================
  // 核心 API
  // ============================================

  /**
   * 执行蜂群协作
   */
  async run(task: string, options?: SwarmOptions): Promise<SwarmResult> {
    const startTime = Date.now();

    // 0. 分类（可选）
    const shouldClassify = options?.classify !== false;
    let classification: Awaited<ReturnType<typeof classifyTask>> | undefined;

    const allTemplates = [...this.templates.values()];
    const matchOptions: MatchTemplateOptions = {
      templateName: options?.template,
    };

    if (shouldClassify) {
      classification = await classifyTask(
        task,
        this.context.providerManager
      );
      matchOptions.variant = classification.classification.complexity;
    }

    // 1. 匹配模板
    const matchResult = matchTemplateDetailed(
      task,
      allTemplates,
      matchOptions
    );

    if (!matchResult) {
      return this.fallbackToWorkflow(task, options, startTime);
    }

    const template = matchResult.template;

    // 2. 创建黑板和追踪器
    const tracer = new SwarmTracer();
    const blackboard = new Blackboard({
      maxLen: options?.blackboardMaxLen,
    });
    blackboard.set('task', task);

    tracer.record({
      type: 'swarm.start',
      metadata: { task },
    });

    // 记录分类事件
    if (classification) {
      tracer.record(createClassifierEvent(classification, tracer.getSwarmId()));

      if (classification.lowConfidence) {
        tracer.record(createLowConfidenceEvent(classification, tracer.getSwarmId()));
      }
    }

    // 记录 variant fallback
    if (matchResult.variantFallback) {
      tracer.record({
        type: 'template.variant-fallback',
        metadata: matchResult.variantFallback,
      });
    }

    tracer.record({
      type: 'template.match',
      metadata: {
        template: template.name,
        variant: template.variant ?? 'medium',
      },
    });

    options?.onPhase?.(
      'template-match',
      `Matched template: ${template.name}${template.variant ? ` (${template.variant})` : ''}`
    );

    try {
      // 3. 构建 DAG
      const graph = buildGraph(template, blackboard, tracer);

      options?.onPhase?.('execute', `Executing ${graph.layers.length} layers`);

      // 4. 执行
      const executor = new SwarmExecutor(this.context.runner, options);
      const nodeResults = await executor.execute(graph, blackboard, tracer);

      // 5. 聚合
      options?.onPhase?.('aggregate', 'Aggregating results');
      const nodeResultsMap = new Map(Object.entries(
        Object.fromEntries(nodeResults)
      ) as [string, NodeResult][]);

      const { text, success, error } = aggregate(
        graph.aggregate,
        nodeResultsMap,
        graph.terminalNodes
      );

      const usage = sumUsage(nodeResultsMap);
      const duration = Date.now() - startTime;

      tracer.record({
        type: 'swarm.complete',
        metadata: { success, duration },
      });

      options?.onPhase?.('complete', success ? 'Swarm complete' : 'Swarm failed');

      // 触发 hook
      try {
        await this.context.hookRegistry.emit('swarm:complete' as any, {
          sessionId: this.context.hookRegistry.getSessionId(),
          swarmId: tracer.getSwarmId(),
          template: template.name,
          success,
          duration,
          timestamp: new Date(),
        } as any);
      } catch {
        // hook 不影响主流程
      }

      return {
        text,
        success,
        template: template.name,
        nodeResults: Object.fromEntries(nodeResultsMap),
        trace: [...tracer.getEvents()],
        duration,
        usage,
        error,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : String(error);

      tracer.record({
        type: 'swarm.error',
        error: errMsg,
      });

      return {
        text: '',
        success: false,
        template: template.name,
        nodeResults: {},
        trace: [...tracer.getEvents()],
        duration,
        error: errMsg,
      };
    }
  }

  /**
   * 预览匹配结果（不执行）
   */
  preview(task: string, templateName?: string): SwarmPreview | null {
    const template = matchTemplate(
      task,
      [...this.templates.values()],
      templateName
    );
    if (!template) return null;

    const blackboard = new Blackboard();
    blackboard.set('task', task);
    const tracer = new SwarmTracer();
    const graph = buildGraph(template, blackboard, tracer);

    const agents = [...new Set(Object.values(graph.nodes).map(n => n.agent))];

    return {
      template: template.name,
      description: template.description,
      layers: graph.layers,
      agents,
    };
  }

  /**
   * 注册自定义模板
   */
  registerTemplate(template: SwarmTemplate): void {
    const key = template.variant
      ? `${template.name}:${template.variant}`
      : template.name;
    this.templates.set(key, template);
  }

  /**
   * 列出所有可用模板
   */
  listTemplates(): Array<{ name: string; variant?: string; description: string }> {
    return [...this.templates.values()].map(t => ({
      name: t.name,
      variant: t.variant,
      description: t.description,
    }));
  }

  // ============================================
  // 降级
  // ============================================

  /**
   * 降级到现有 WorkflowCapability
   */
  private async fallbackToWorkflow(
    task: string,
    options: SwarmOptions | undefined,
    startTime: number
  ): Promise<SwarmResult> {
    try {
      const workflowCap = (this.context as any).capabilityRegistry?.get({
        name: 'workflow',
        initialize() {},
      } as any);

      const result = await (workflowCap as any).run(task, {
        cwd: options?.cwd,
        onText: options?.onText ? (t: string) => options.onText!('workflow', t) : undefined,
      });

      const executeResult = result?.executeResult as AgentResult | undefined;

      return {
        text: executeResult?.text ?? '',
        success: result?.success ?? false,
        template: '_fallback_workflow',
        nodeResults: {},
        trace: [],
        duration: Date.now() - startTime,
        error: result?.error,
      };
    } catch {
      return {
        text: '',
        success: false,
        template: '_fallback_workflow',
        nodeResults: {},
        trace: [],
        duration: Date.now() - startTime,
        error: 'No matching swarm template and workflow fallback failed',
      };
    }
  }
}
