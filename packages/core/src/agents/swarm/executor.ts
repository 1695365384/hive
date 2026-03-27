/**
 * DAG 执行引擎
 *
 * 拓扑排序 + 分层并行执行
 */

import type { AgentRunner } from '../core/runner.js';
import type {
  ExecutableGraph,
  ExecutableNode,
  NodeResult,
  SwarmOptions,
} from './types.js';
import { Blackboard } from './blackboard.js';
import { SwarmTracer } from './tracer.js';

/** 默认并发数 */
const DEFAULT_MAX_CONCURRENT = 5;
/** 默认节点超时（毫秒） */
const DEFAULT_NODE_TIMEOUT = 60_000;

/**
 * 蜂群执行引擎
 */
export class SwarmExecutor {
  private runner: AgentRunner;
  private options: SwarmOptions;
  private readonly prefix: string;

  constructor(runner: AgentRunner, options: SwarmOptions = {}) {
    this.runner = runner;
    this.options = options;
    this.prefix = options.nodeIdPrefix ? `${options.nodeIdPrefix}.` : '';
  }

  /**
   * 执行蜂群 DAG
   */
  async execute(
    graph: ExecutableGraph,
    blackboard: Blackboard,
    tracer: SwarmTracer
  ): Promise<Map<string, NodeResult>> {
    const results = new Map<string, NodeResult>();
    const maxConcurrent = this.options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;

    for (let layerIndex = 0; layerIndex < graph.layers.length; layerIndex++) {
      const layer = graph.layers[layerIndex];

      tracer.record({
        type: 'layer.start',
        layerIndex,
        metadata: { nodeIds: layer },
      });

      // 同层并行执行（带并发控制）
      const layerResults = await this.executeLayer(
        layer,
        layerIndex,
        graph.nodes,
        blackboard,
        tracer,
        results,
        maxConcurrent
      );

      // 收集结果
      for (const [nodeId, result] of layerResults) {
        results.set(nodeId, result);
      }

      tracer.record({
        type: 'layer.complete',
        layerIndex,
        blackboardSnapshot: blackboard.snapshot(),
      });
    }

    return results;
  }

  /**
   * 执行单层节点（并行 + 并发控制）
   */
  private async executeLayer(
    nodeIds: string[],
    layerIndex: number,
    nodes: Record<string, ExecutableNode>,
    blackboard: Blackboard,
    tracer: SwarmTracer,
    previousResults: Map<string, NodeResult>,
    maxConcurrent: number
  ): Promise<Map<string, NodeResult>> {
    const results = new Map<string, NodeResult>();
    let currentIndex = 0;

    const worker = async (): Promise<void> => {
      while (currentIndex < nodeIds.length) {
        const idx = currentIndex++;
        const nodeId = nodeIds[idx];
        const node = nodes[nodeId];

        const result = await this.executeNode(
          nodeId,
          node,
          layerIndex,
          blackboard,
          tracer,
          previousResults
        );

        results.set(nodeId, result);
      }
    };

    // 启动 worker pool
    const workers = Array.from(
      { length: Math.min(nodeIds.length, maxConcurrent) },
      () => worker()
    );

    await Promise.all(workers);
    return results;
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    nodeId: string,
    node: ExecutableNode,
    layerIndex: number,
    blackboard: Blackboard,
    tracer: SwarmTracer,
    previousResults: Map<string, NodeResult>
  ): Promise<NodeResult> {
    // 检查依赖是否全部成功
    const failedDep = this.findFailedDependency(node, previousResults);
    if (failedDep) {
      const result: NodeResult = {
        nodeId,
        text: '',
        tools: [],
        success: false,
        skipped: true,
        skipReason: `Dependency ${failedDep} failed or was skipped`,
        duration: 0,
      };

      blackboard.set(this.prefix + nodeId, result);
      tracer.record({
        type: 'node.skipped',
        nodeId: this.prefix + nodeId,
        layerIndex,
        error: result.skipReason,
      });

      return result;
    }

    // 执行前重新渲染 prompt（可能依赖同层之前写入黑板的结果）
    // 对于同层节点，黑板中已有初始值，直接用节点预渲染的 prompt
    const prompt = node.prompt;
    const startTime = Date.now();

    tracer.record({
      type: 'node.start',
      nodeId,
      layerIndex,
      agent: node.agent,
      model: node.model,
      prompt,
    });

    try {
      const agentResult = await this.runner.execute(node.agent, prompt, {
        model: node.model,
        timeout: node.timeout ?? DEFAULT_NODE_TIMEOUT,
        onText: (text) => this.options.onText?.(nodeId, text),
      });

      const duration = Date.now() - startTime;
      const result: NodeResult = {
        ...agentResult,
        nodeId,
        duration,
      };

      blackboard.set(this.prefix + nodeId, result);

      tracer.record({
        type: 'node.complete',
        nodeId: this.prefix + nodeId,
        layerIndex,
        agent: node.agent,
        model: node.model,
        resultLength: result.text.length,
        resultTruncated: blackboard.snapshot()[nodeId]?.truncated ?? false,
        tools: result.tools,
        duration,
        usage: result.usage,
      });

      this.options.onNodeComplete?.(nodeId, result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : String(error);

      const result: NodeResult = {
        nodeId,
        text: '',
        tools: [],
        success: false,
        error: errMsg,
        duration,
      };

      blackboard.set(this.prefix + nodeId, result);

      tracer.record({
        type: 'node.error',
        nodeId: this.prefix + nodeId,
        layerIndex,
        agent: node.agent,
        error: errMsg,
        duration,
      });

      return result;
    }
  }

  /**
   * 检查是否有依赖失败或被跳过
   */
  private findFailedDependency(
    node: ExecutableNode,
    previousResults: Map<string, NodeResult>
  ): string | null {
    for (const depId of node.depends) {
      const depResult = previousResults.get(depId);
      if (!depResult || !depResult.success || depResult.skipped) {
        return depId;
      }
    }
    return null;
  }
}
