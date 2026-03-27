/**
 * Pipeline 追踪报告生成
 *
 * 将 PipelineTraceEvent[] 渲染为人类可读的报告。
 */

import type { PipelineTraceEvent } from './types.js';

/**
 * 生成 Pipeline 执行报告
 */
export function generatePipelineReport(events: PipelineTraceEvent[]): string {
  const lines: string[] = [];

  // Pipeline 标题
  const pipelineStart = events.find(e => e.type === 'pipeline.start');
  const pipelineId = pipelineStart?.pipelineId ?? 'unknown';
  lines.push(`═══ Pipeline #${pipelineId} ═══`);

  if (pipelineStart?.metadata?.task) {
    lines.push(`Task: "${pipelineStart.metadata.task}"`);
  }

  lines.push('─────────────────────────────────────────');

  // 按阶段输出
  const stageStarts = events.filter(e => e.type === 'stage.start');
  const stageCompletes = events.filter(e => e.type === 'stage.complete');
  const stageSkipped = events.filter(e => e.type === 'stage.skipped');

  for (let i = 0; i < stageStarts.length; i++) {
    const start = stageStarts[i];
    const complete = stageCompletes[i];
    const skipped = stageSkipped.find(
      s => s.stageName === start.stageName
    );

    const stageName = start.stageName ?? `stage-${i}`;
    const template = start.template ?? 'unknown';
    const variant = start.variant ?? 'medium';

    if (skipped) {
      const dur = ((skipped.duration ?? 0) / 1000).toFixed(1);
      lines.push(
        `⏭️  [${stageName}] ${template} (${variant}) — Skipped: ${skipped.skipReason ?? 'unknown'} (${dur}s)`
      );
    } else if (complete) {
      const dur = ((complete.duration ?? 0) / 1000).toFixed(1);
      const meta = complete.metadata ?? {};
      const success = meta.success !== false;
      const icon = success ? '✅' : '❌';
      lines.push(
        `${icon} [${stageName}] ${template} (${variant}) — ${success ? 'Success' : 'Failed'} (${dur}s)`
      );
    }
  }

  // 汇总
  const pipelineComplete = events.find(e => e.type === 'pipeline.complete');
  const meta = pipelineComplete?.metadata ?? {};
  const success = meta.success !== false;

  // 计算总耗时
  const duration = events.length >= 2
    ? events[events.length - 1].timestamp - events[0].timestamp
    : 0;
  const durationSec = (duration / 1000).toFixed(1);

  // 统计
  const executedCount = stageCompletes.length;
  const skippedCount = stageSkipped.length;

  lines.push('─────────────────────────────────────────');
  lines.push(
    `═══ Total: ${durationSec}s | ${executedCount} executed, ${skippedCount} skipped | ${success ? 'Success' : 'Failed'} ═══`
  );

  return lines.join('\n');
}
