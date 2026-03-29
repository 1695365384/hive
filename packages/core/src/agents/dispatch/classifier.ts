/**
 * Dispatch 分类器
 *
 * 使用 LLM 将任务分类到执行层 (chat/workflow)。
 * 成本极低（~100-200 tokens），用于智能路由。
 */

import type { ClassifierProvider } from './llm-utils.js';
import { callClassifierLLM, extractJSON } from './llm-utils.js';

// ============================================
// 分类器类型
// ============================================

type ExecutionLayer = 'chat' | 'workflow';

const VALID_EXECUTION_LAYERS = ['chat', 'workflow'] as const;

export interface DispatchClassification {
  layer: ExecutionLayer;
  taskType: 'general' | 'code-task';
  complexity: 'simple' | 'moderate' | 'complex';
  confidence: number;
  reason: string;
}

interface ClassifierTraceEvent {
  timestamp: number;
  type: string;
  layer?: string;
  confidence?: number;
  latency?: number;
  reason?: string;
}

// ============================================
// 分发分类 Prompt
// ============================================

const DISPATCH_SYSTEM_PROMPT = `You are a task router. Classify the given task into an execution layer.

## Execution Layers
- chat: Greetings, casual conversation, questions, explanations, opinions. No code changes or multi-step work needed. 1 LLM call, fast response.
- workflow: Tasks requiring code changes, file exploration, debugging, refactoring, or multi-step execution. 3-10 LLM calls via explore → plan → execute pipeline.

## Decision Rules
1. Greetings, casual chat, thanks, short pleasantries → chat (always)
2. Questions about knowledge, concepts, or how things work → chat
3. Tasks that require writing/modifying code, reading files, or multi-step operations → workflow
4. If uncertain → chat (chat is cheap: 1 LLM call. workflow is expensive: 3-10 calls. Prefer chat when unsure.)

## Examples
"你好啊" → chat (greeting)
"hello" → chat (greeting)
"谢谢" → chat (thanks)
"今天天气怎么样" → chat (casual conversation)
"什么是 REST API" → chat (knowledge question)
"这个项目是做什么的" → chat (question about project)
"帮我重构登录模块" → workflow (code refactoring)
"Fix the auth bug in login.ts" → workflow (code fix)
"请实现用户注册功能" → workflow (code implementation)

## Output Format
Respond with ONLY a JSON object, no other text:
{"layer":"<chat|workflow>","taskType":"<general|code-task>","complexity":"<simple|moderate|complex>","confidence":<0.0-1.0>,"reason":"<brief explanation>"}

## Rules
- confidence >= 0.8 for greetings and casual conversation
- confidence >= 0.7 for clear-cut code tasks or clear questions
- confidence 0.5-0.7 for ambiguous cases
- Default taskType to "general" if unsure
- Default complexity to "simple" for chat layer`;

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
): Promise<{ classification: DispatchClassification; trace: ClassifierTraceEvent[] }> {
  const trace: ClassifierTraceEvent[] = [];
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
