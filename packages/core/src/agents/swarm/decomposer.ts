/**
 * 模板匹配与 Prompt 渲染
 */

import type { SwarmTemplate, SwarmNode, ExecutableNode, ExecutableGraph, TemplateVariant } from './types.js';
import { CyclicDependencyError } from './types.js';
import { Blackboard } from './blackboard.js';
import { SwarmTracer } from './tracer.js';

/**
 * 模板匹配选项
 */
export interface MatchTemplateOptions {
  /** 强制使用指定模板名（跳过正则匹配） */
  templateName?: string;
  /** 指定模板变体 */
  variant?: TemplateVariant;
}

/**
 * 模板匹配结果（含 fallback 信息）
 */
export interface MatchResult {
  /** 匹配的模板 */
  template: SwarmTemplate;
  /** 是否发生了 variant fallback */
  variantFallback?: {
    /** 请求的变体 */
    requested: TemplateVariant;
    /** 实际使用的变体 */
    actual: TemplateVariant;
  };
}

/**
 * 从模板列表中匹配任务
 *
 * 匹配逻辑：
 * 1. 如果指定 templateName，按名称查找
 * 2. 否则按正则匹配第一个匹配的模板族
 * 3. 在模板族内按 variant 选择变体
 * 4. 找不到精确变体时 fallback 到 medium
 *
 * @returns 匹配结果，或 null（无匹配）
 */
export function matchTemplate(
  task: string,
  templates: SwarmTemplate[],
  options?: string | MatchTemplateOptions
): SwarmTemplate | null {
  // 兼容旧 API：options 为 string 时当作 templateName
  const opts: MatchTemplateOptions = typeof options === 'string'
    ? { templateName: options }
    : options ?? {};

  // 指定名称优先
  if (opts.templateName) {
    const exact = templates.find(
      t => t.name === opts.templateName && t.variant === opts.variant
    );
    if (exact) return exact;

    // 尝试只按名称匹配（忽略 variant）
    const byName = templates.find(t => t.name === opts.templateName);
    if (byName) return byName;

    return null;
  }

  // 按正则匹配模板族（取第一个匹配的）
  const matched = templates.find(tpl => tpl.match.test(task));
  if (!matched) return null;

  // 无 variant 需求 → 默认使用 medium 变体
  if (!opts.variant) {
    const family = templates.filter(
      t => t.name === matched.name && t.match.source === matched.match.source
    );
    const medium = family.find(t => !t.variant || t.variant === 'medium');
    return medium ?? matched;
  }

  // 在同族模板中查找指定 variant
  const family = templates.filter(
    t => t.name === matched.name && t.match.source === matched.match.source
  );
  const exactVariant = family.find(t => t.variant === opts.variant);

  if (exactVariant) return exactVariant;

  // Fallback 到 medium
  const medium = family.find(t => !t.variant || t.variant === 'medium');
  if (medium) return medium;

  // 最后 fallback：返回原始匹配
  return matched;
}

/**
 * 从模板列表中匹配任务（返回详细匹配结果）
 */
export function matchTemplateDetailed(
  task: string,
  templates: SwarmTemplate[],
  options?: MatchTemplateOptions
): MatchResult | null {
  // 指定名称优先
  if (options?.templateName) {
    const family = templates.filter(t => t.name === options.templateName);
    if (family.length === 0) return null;

    if (options.variant) {
      const exact = family.find(t => t.variant === options.variant);
      if (exact) return { template: exact };

      const medium = family.find(t => !t.variant || t.variant === 'medium');
      if (medium) {
        return {
          template: medium,
          variantFallback: {
            requested: options.variant,
            actual: medium.variant ?? 'medium',
          },
        };
      }

      return { template: family[0] };
    }

    // 无 variant → 默认 medium
    const defaultMedium = family.find(t => !t.variant || t.variant === 'medium');
    return { template: defaultMedium ?? family[0] };
  }

  // 按正则匹配模板族
  const matched = templates.find(tpl => tpl.match.test(task));
  if (!matched) return null;

  // 无 variant → 默认 medium
  if (!options?.variant) {
    const family = templates.filter(
      t => t.name === matched.name && t.match.source === matched.match.source
    );
    const medium = family.find(t => !t.variant || t.variant === 'medium');
    return { template: medium ?? matched };
  }

  const family = templates.filter(
    t => t.name === matched.name && t.match.source === matched.match.source
  );
  const exactVariant = family.find(t => t.variant === options.variant);

  if (exactVariant) return { template: exactVariant };

  const medium = family.find(t => !t.variant || t.variant === 'medium');
  if (medium) {
    return {
      template: medium,
      variantFallback: {
        requested: options.variant,
        actual: medium.variant ?? 'medium',
      },
    };
  }

  return { template: matched };
}

/**
 * 拓扑排序（分层）
 *
 * @returns 分层节点 ID 数组，如 [['a', 'b'], ['c'], ['d']]
 * @throws CyclicDependencyError 如果存在环
 */
export function topologicalSort(
  nodes: Record<string, SwarmNode | ExecutableNode>
): string[][] {
  const ids = Object.keys(nodes);
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  // 初始化
  for (const id of ids) {
    inDegree.set(id, 0);
    dependents.set(id, []);
  }

  // 构建入度和依赖关系
  for (const [id, node] of Object.entries(nodes)) {
    for (const dep of node.depends) {
      if (!ids.includes(dep)) continue;
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      dependents.get(dep)!.push(id);
    }
  }

  const layers: string[][] = [];
  const remaining = new Set(ids);

  while (remaining.size > 0) {
    // 找出当前入度为 0 的节点
    const layer = [...remaining].filter(id => inDegree.get(id) === 0);

    if (layer.length === 0) {
      // 没有入度为 0 的节点 → 有环
      throw new CyclicDependencyError([...remaining]);
    }

    layers.push(layer);

    // 移除该层节点，更新入度
    for (const id of layer) {
      remaining.delete(id);
      for (const dep of dependents.get(id) ?? []) {
        if (remaining.has(dep)) {
          inDegree.set(dep, (inDegree.get(dep) ?? 0) - 1);
        }
      }
    }
  }

  return layers;
}

/**
 * 检测 DAG 中是否存在环
 */
export function detectCycle(nodes: Record<string, SwarmNode | ExecutableNode>): boolean {
  try {
    topologicalSort(nodes);
    return false;
  } catch {
    return true;
  }
}

/**
 * 渲染节点 Prompt（注入黑板值）
 */
export function renderNodePrompt(
  node: SwarmNode,
  blackboard: Blackboard
): string {
  return blackboard.render(node.prompt);
}

/**
 * 构建可执行图
 */
export function buildGraph(
  template: SwarmTemplate,
  blackboard: Blackboard,
  tracer: SwarmTracer
): ExecutableGraph {
  const swarmId = tracer.getSwarmId();
  const task = blackboard.get<string>('task') ?? '';

  // 渲染每个节点的 prompt
  const nodes: Record<string, ExecutableNode> = {};
  for (const [id, node] of Object.entries(template.nodes)) {
    nodes[id] = {
      id,
      prompt: renderNodePrompt(node, blackboard),
      agent: node.agent,
      model: node.model,
      timeout: node.timeout,
      maxTurns: node.maxTurns,
      depends: [...node.depends],
    };
  }

  // 拓扑排序
  const layers = topologicalSort(nodes);

  // 找出终端节点（没有其他节点依赖它的）
  const allDependents = new Set<string>();
  for (const node of Object.values(nodes)) {
    for (const dep of node.depends) {
      allDependents.add(dep);
    }
  }
  const terminalNodes = Object.keys(nodes).filter(id => !allDependents.has(id));

  tracer.record({
    type: 'graph.build',
    metadata: {
      nodeCount: Object.keys(nodes).length,
      layerCount: layers.length,
      terminalNodes,
    },
  });

  return {
    swarmId,
    templateName: template.name,
    task,
    nodes,
    layers,
    terminalNodes,
    aggregate: template.aggregate,
  };
}
