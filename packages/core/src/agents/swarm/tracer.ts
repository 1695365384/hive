/**
 * 蜂群执行追踪器
 *
 * 记录蜂群执行全链路事件，生成可审计的报告。
 */

import type { TraceEvent, BlackboardEntry } from './types.js';

/**
 * 执行追踪器
 */
export class SwarmTracer {
  private readonly events: TraceEvent[] = [];
  private readonly swarmId: string;
  private readonly startTime: number;

  constructor(swarmId?: string) {
    this.swarmId = swarmId ?? `sw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.startTime = Date.now();
  }

  // ============================================
  // 记录
  // ============================================

  /**
   * 记录事件
   */
  record(event: Omit<TraceEvent, 'swarmId' | 'timestamp'>): void {
    this.events.push({
      ...event,
      swarmId: this.swarmId,
      timestamp: Date.now(),
    });
  }

  /**
   * 记录带手动时间戳的事件
   */
  recordWithTimestamp(event: TraceEvent): void {
    this.events.push(event);
  }

  // ============================================
  // 查询
  // ============================================

  /**
   * 获取全部事件（只读）
   */
  getEvents(): ReadonlyArray<TraceEvent> {
    return this.events;
  }

  /**
   * 获取蜂群 ID
   */
  getSwarmId(): string {
    return this.swarmId;
  }

  /**
   * 获取总耗时（毫秒）
   */
  getDuration(): number {
    if (this.events.length === 0) return 0;
    const last = this.events[this.events.length - 1];
    const first = this.events[0];
    return last.timestamp - first.timestamp;
  }

  /**
   * 获取所有节点的 Token 使用量汇总
   */
  getTokenUsage(): { input: number; output: number } {
    let input = 0;
    let output = 0;

    for (const event of this.events) {
      if (event.usage) {
        input += event.usage.input;
        output += event.usage.output;
      }
    }

    return { input, output };
  }

  /**
   * 获取所有事件的 JSON
   */
  toJSON(): TraceEvent[] {
    return [...this.events];
  }

  // ============================================
  // 报告生成
  // ============================================

  /**
   * 生成人类可读的树状报告
   */
  report(): string {
    const lines: string[] = [];
    lines.push(`═══ Swarm #${this.swarmId} ═══`);

    // 提取任务和模板信息
    const startEvent = this.events.find(e => e.type === 'swarm.start');
    const classifierEvent = this.events.find(e => e.type === 'classifier.complete');
    const templateEvent = this.events.find(e => e.type === 'template.match');

    if (startEvent?.metadata?.task) {
      lines.push(`Task: "${startEvent.metadata.task}"`);
    }

    // 显示分类结果
    if (classifierEvent) {
      const meta = classifierEvent.metadata;
      const conf = typeof meta?.confidence === 'number'
        ? (meta.confidence * 100).toFixed(0)
        : '?';
      lines.push(
        `Classification: ${meta?.type ?? '?'}/${meta?.complexity ?? '?'} (${conf}%)`
      );

      // 显示低置信度警告
      const lowConfEvent = this.events.find(e => e.type === 'classifier.low-confidence');
      if (lowConfEvent) {
        lines.push(`⚠️  Low confidence classification (fallback to medium variant)`);
      }
    }

    if (templateEvent) {
      const variant = templateEvent.metadata?.variant;
      const templateName = templateEvent.metadata?.template ?? 'unknown';
      lines.push(`Template: ${templateName}${variant ? ` (${variant})` : ''}`);
    }

    lines.push('─────────────────────────────────────────');

    // 按层输出节点执行情况
    const layerStarts = this.events.filter(e => e.type === 'layer.start');
    const layerCompletes = this.events.filter(e => e.type === 'layer.complete');

    for (let i = 0; i < layerStarts.length; i++) {
      const start = layerStarts[i];
      const complete = layerCompletes[i];
      const layerDuration = complete
        ? complete.timestamp - start.timestamp
        : 0;
      const nodeIds = (start.metadata?.nodeIds as string[]) ?? [];
      const durationSec = (layerDuration / 1000).toFixed(1);

      lines.push(`[Layer ${start.layerIndex ?? i}] ${nodeIds.length} nodes, ${durationSec}s`);

      // 输出该层每个节点的结果
      const nodeEvents = this.events.filter(
        e =>
          (e.type === 'node.complete' || e.type === 'node.error' || e.type === 'node.skipped') &&
          e.layerIndex === (start.layerIndex ?? i)
      );

      for (const node of nodeEvents) {
        if (node.type === 'node.complete') {
          const dur = ((node.duration ?? 0) / 1000).toFixed(1);
          const tools = node.tools?.length ? ` [${node.tools.join(', ')}]` : '';
          lines.push(
            `  ✅ ${node.nodeId} (${node.model ?? 'default'}, ${dur}s) → ${node.resultLength ?? 0} chars${tools}`
          );
        } else if (node.type === 'node.error') {
          lines.push(`  ❌ ${node.nodeId} (${node.error})`);
        } else if (node.type === 'node.skipped') {
          lines.push(`  ⏭️ ${node.nodeId} (Skipped: ${node.error ?? 'unknown'})`);
        }
      }
    }

    // 汇总
    const duration = this.getDuration();
    const usage = this.getTokenUsage();
    const durationSec = (duration / 1000).toFixed(1);

    lines.push(`═══ Total: ${durationSec}s | Tokens: in=${usage.input} out=${usage.output} ═══`);

    return lines.join('\n');
  }
}
