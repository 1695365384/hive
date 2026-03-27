/**
 * 结果聚合策略
 */

import type {
  SwarmAggregateConfig,
  AggregateFormat,
  NodeResult,
} from './types.js';

/**
 * 聚合蜂群执行结果
 */
export function aggregate(
  config: SwarmAggregateConfig,
  nodeResults: Map<string, NodeResult>,
  terminalNodes: string[]
): { text: string; success: boolean; error?: string } {
  const format = config.mergeFormat ?? 'section';

  // 尝试获取主节点结果
  let primary = nodeResults.get(config.primary);

  // 主节点失败时，尝试找其他成功的终端节点作为 fallback
  if (!primary || !primary.success || primary.skipped) {
    for (const nodeId of terminalNodes) {
      if (nodeId === config.primary) continue;
      const result = nodeResults.get(nodeId);
      if (result?.success && !result.skipped) {
        primary = result;
        break;
      }
    }
  }

  if (!primary || !primary.success) {
    // 全部失败
    const errors = [...nodeResults.values()]
      .filter(r => r.error)
      .map(r => r.error)
      .join('; ');
    return { text: '', success: false, error: errors || 'All nodes failed' };
  }

  let text = primary.text;

  // 合并附加节点
  if (config.merge && config.merge.length > 0) {
    for (const nodeId of config.merge) {
      const result = nodeResults.get(nodeId);
      if (!result?.success || result.skipped) continue;

      if (format === 'summary') continue; // summary 模式不合并

      text += formatMerge(format, nodeId, result.text);
    }
  }

  return { text, success: true };
}

/**
 * 格式化合并内容
 */
export function formatMerge(
  format: AggregateFormat,
  nodeId: string,
  text: string
): string {
  switch (format) {
    case 'append':
      return `\n\n${text}`;
    case 'section':
      return `\n\n## ${nodeId}\n\n${text}`;
    default:
      return `\n\n${text}`;
  }
}

/**
 * 汇总所有节点的 Token 使用量
 */
export function sumUsage(nodeResults: Map<string, NodeResult>): {
  input: number;
  output: number;
} {
  let input = 0;
  let output = 0;

  for (const result of nodeResults.values()) {
    if (result.usage) {
      input += result.usage.input;
      output += result.usage.output;
    }
  }

  return { input, output };
}
