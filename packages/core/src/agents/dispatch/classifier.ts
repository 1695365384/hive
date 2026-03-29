/**
 * Dispatch 分类器
 *
 * 使用 LLM 将任务分类到执行层 (chat/workflow)。
 * 成本极低（~100-200 tokens），用于智能路由。
 */

import type {
  DispatchClassification,
  DispatchTraceEvent,
} from './types.js';
import { VALID_EXECUTION_LAYERS } from './types.js';
import type { ClassifierProvider } from './llm-utils.js';
import { callClassifierLLM, extractJSON } from './llm-utils.js';

// ============================================
// 分发分类 Prompt
// ============================================

const DISPATCH_SYSTEM_PROMPT = `You are a task router. Classify the given task into an execution layer.

## Execution Layers
- chat: Greetings, casual conversation, questions, explanations. No code changes needed. 1 LLM call.
- workflow: Code changes, file exploration, debugging, refactoring, multi-step execution. 3-10 LLM calls.

## Decision Rules
1. Greetings, casual chat, thanks → ALWAYS chat
2. Knowledge questions, concept explanations → chat
3. Code changes, file operations, debugging → workflow
4. Uncertain → chat (chat costs 1 call, workflow costs 3-10 calls)

## Examples

Input: "你好啊"
{"layer":"chat","taskType":"general","complexity":"simple","confidence":0.95,"reason":"Greeting"}

Input: "hello"
{"layer":"chat","taskType":"general","complexity":"simple","confidence":0.95,"reason":"Greeting"}

Input: "谢谢"
{"layer":"chat","taskType":"general","complexity":"simple","confidence":0.95,"reason":"Thanks"}

Input: "在吗"
{"layer":"chat","taskType":"general","complexity":"simple","confidence":0.95,"reason":"Casual greeting"}

Input: "今天天气怎么样"
{"layer":"chat","taskType":"general","complexity":"simple","confidence":0.9,"reason":"Casual conversation"}

Input: "什么是 REST API"
{"layer":"chat","taskType":"general","complexity":"simple","confidence":0.9,"reason":"Knowledge question"}

Input: "帮我重构登录模块"
{"layer":"workflow","taskType":"code-task","complexity":"moderate","confidence":0.9,"reason":"Code refactoring"}

Input: "Fix the auth bug in login.ts"
{"layer":"workflow","taskType":"code-task","complexity":"moderate","confidence":0.9,"reason":"Code fix"}

## Output Format
Respond with ONLY a JSON object, no other text:
{"layer":"<chat|workflow>","taskType":"<general|code-task>","complexity":"<simple|moderate|complex>","confidence":<0.0-1.0>,"reason":"<brief explanation>"}`;

// ============================================
// 默认分类
// ============================================

const DEFAULT_CLASSIFICATION: DispatchClassification = {
  layer: 'chat',
  taskType: 'general',
  complexity: 'moderate',
  confidence: 0,
  reason: 'Classification failed, defaulting to chat',
};

// ============================================
// 有效值校验
// ============================================

function validateLayer(value: unknown): DispatchClassification['layer'] {
  if (typeof value === 'string' && (VALID_EXECUTION_LAYERS as readonly string[]).includes(value)) {
    return value as DispatchClassification['layer'];
  }
  return 'chat';
}

function validateTaskType(value: unknown): DispatchClassification['taskType'] {
  if (value === 'general' || value === 'code-task') {
    return value;
  }
  return 'general';
}

function validateComplexity(value: unknown): DispatchClassification['complexity'] {
  if (value === 'simple' || value === 'moderate' || value === 'complex') {
    return value;
  }
  return 'moderate';
}

// ============================================
// 核心函数
// ============================================

/**
 * 对任务进行分发分类
 */
export async function classifyForDispatch(
  task: string,
  provider: ClassifierProvider,
  modelOverride?: string
): Promise<{ classification: DispatchClassification; trace: DispatchTraceEvent[] }> {
  const trace: DispatchTraceEvent[] = [];
  const startTime = Date.now();
  const activeProvider = provider.getActiveProvider();
  const model = modelOverride ?? activeProvider?.model;

  try {
    const responseText = await callClassifierLLM(task, DISPATCH_SYSTEM_PROMPT, provider, model);
    const latency = Date.now() - startTime;
    const classification = parseDispatchClassification(responseText);

    trace.push({
      timestamp: Date.now(),
      type: 'dispatch.classify',
      layer: classification.layer,
      confidence: classification.confidence,
      latency,
      reason: classification.reason,
    });

    return { classification, trace };
  } catch {
    const latency = Date.now() - startTime;

    trace.push({
      timestamp: Date.now(),
      type: 'dispatch.classify',
      layer: 'chat',
      confidence: 0,
      latency,
      reason: 'LLM classification failed',
    });

    return {
      classification: { ...DEFAULT_CLASSIFICATION, reason: 'LLM classification failed' },
      trace,
    };
  }
}

/**
 * 解析分发分类结果
 */
export function parseDispatchClassification(text: string): DispatchClassification {
  const parsed = extractJSON<{
    layer?: unknown;
    taskType?: unknown;
    complexity?: unknown;
    confidence?: unknown;
    reason?: unknown;
  }>(text);

  if (!parsed) {
    return { ...DEFAULT_CLASSIFICATION };
  }

  const layer = validateLayer(parsed.layer);
  const taskType = validateTaskType(parsed.taskType);
  const complexity = validateComplexity(parsed.complexity);
  const confidence = typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0;
  const reason = typeof parsed.reason === 'string' ? parsed.reason : '';

  return { layer, taskType, complexity, confidence, reason };
}

// ============================================
// 正则 Fallback 分类
// ============================================

/**
 * 正则 fallback 分类器
 *
 * 当 LLM 分类不可用或低置信度时使用。
 */
export function regexClassify(task: string): DispatchClassification {
  // 代码任务关键词 → workflow（优先于短问题启发式）
  if (/代码|实现|添加|修复|重构|review|implement|fix bug|refactor|添加功能|新增|创建/i.test(task)) {
    return {
      layer: 'workflow',
      taskType: 'code-task',
      complexity: 'moderate',
      confidence: 0.3,
      reason: 'Code task keywords detected',
    };
  }

  // 短问题 → chat
  if (task.length < 100 && task.trim().endsWith('?') && !task.includes('\n')) {
    return {
      layer: 'chat',
      taskType: 'general',
      complexity: 'simple',
      confidence: 0.3,
      reason: 'Short question heuristic',
    };
  }

  // 默认 → chat
  return {
    layer: 'chat',
    taskType: 'general',
    complexity: 'simple',
    confidence: 0.2,
    reason: 'No pattern matched, defaulting to chat',
  };
}
