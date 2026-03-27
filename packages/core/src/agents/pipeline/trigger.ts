/**
 * 触发条件引擎
 *
 * 评估 Pipeline 阶段是否应该执行。
 */

import type {
  TriggerCondition,
  FieldOperator,
} from './types.js';
import type { Blackboard } from '../swarm/blackboard.js';
import type { NodeResult } from '../swarm/types.js';

/**
 * 触发条件评估上下文
 */
export interface TriggerContext {
  /** 共享黑板 */
  blackboard: Blackboard;
  /** 上一阶段的节点执行结果 */
  nodeResults: Record<string, NodeResult>;
  /** 上一阶段名称（用于节点 ID 前缀解析） */
  previousStageName?: string;
}

/**
 * 评估触发条件
 *
 * @returns true = 执行阶段, false = 跳过阶段
 */
export function evaluateTrigger(
  trigger: TriggerCondition,
  context: TriggerContext
): boolean {
  switch (trigger.type) {
    case 'always':
      return true;

    case 'onField':
      return evaluateOnField(trigger, context);

    case 'onNodeFail':
      return evaluateOnNodeFail(trigger, context);

    case 'confirm':
      // confirm 类型由 executor 处理，这里返回 true（表示条件满足，等待确认）
      return true;
  }
}

/**
 * 评估 onField 条件
 */
function evaluateOnField(
  trigger: { type: 'onField'; field: string; operator: FieldOperator; value: string | number },
  context: TriggerContext
): boolean {
  const fieldValue = context.blackboard.get(trigger.field);

  if (fieldValue === undefined) {
    return false;
  }

  return compareValues(fieldValue, trigger.operator, trigger.value);
}

/**
 * 评估 onNodeFail 条件
 */
function evaluateOnNodeFail(
  trigger: { type: 'onNodeFail'; nodeId: string },
  context: TriggerContext
): boolean {
  const nodeResult = context.nodeResults[trigger.nodeId];
  return nodeResult ? !nodeResult.success : false;
}

/**
 * 比较两个值
 */
function compareValues(
  actual: unknown,
  operator: FieldOperator,
  expected: string | number
): boolean {
  // 类型转换：如果期望是数字且实际是字符串数字，转换
  const actualNum = typeof actual === 'string' ? Number(actual) : actual;
  const expectedNum = typeof expected === 'string' ? Number(expected) : expected;

  switch (operator) {
    case 'eq':
      return actual === expected;
    case 'ne':
      return actual !== expected;
    case 'gt':
      return typeof actualNum === 'number' && typeof expectedNum === 'number'
        && actualNum > expectedNum;
    case 'lt':
      return typeof actualNum === 'number' && typeof expectedNum === 'number'
        && actualNum < expectedNum;
    case 'contains':
      return typeof actual === 'string' && typeof expected === 'string'
        && actual.includes(expected);
    default:
      return false;
  }
}
