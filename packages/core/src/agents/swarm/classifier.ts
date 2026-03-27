/**
 * 任务分类器
 *
 * 使用 LLM (Haiku) 对任务进行分类，输出结构化的任务类型和复杂度。
 * 分类成本极低（~100-200 tokens），用于选择合适的模板变体。
 */

import type { TaskClassification, TaskType, Complexity, TraceEvent } from './types.js';

/**
 * 分类器所需的提供商接口
 */
export interface ClassifierProvider {
  getActiveProvider(): { baseUrl: string; apiKey?: string } | null;
}

// ============================================
// 分类 Prompt
// ============================================

const CLASSIFICATION_SYSTEM_PROMPT = `You are a task classifier. Classify the given task into a type and complexity level.

## Task Types
- add-feature: Adding new functionality, creating new components, implementing features
- debug: Fixing bugs, resolving errors, troubleshooting issues
- code-review: Reviewing code quality, security, or testing coverage
- refactor: Restructuring, optimizing, cleaning up existing code
- general: Documentation, configuration, deployment, or anything else

## Complexity Levels
- simple: Single file change, typo fix, one-liner, adding a simple property, trivial modification
- medium: Multi-file change, moderate feature, standard bug fix, common refactoring
- complex: Large-scale feature, system redesign, cross-module changes, security-sensitive changes, multi-system integration

## Output Format
Respond with ONLY a JSON object, no other text:
{"type":"<type>","complexity":"<level>","confidence":<0.0-1.0>}

## Rules
- confidence >= 0.7 for clear-cut cases
- confidence 0.5-0.7 for ambiguous cases
- confidence < 0.5 only when truly uncertain
- Default to "general" type if unsure
- Default to "medium" complexity if unsure`;

// ============================================
// 分类结果
// ============================================

/** 分类器执行上下文 */
export interface ClassifyContext {
  /** 任务描述 */
  task: string;
  /** 使用的模型 */
  model?: string;
  /** 调用延迟 (ms) */
  latency: number;
}

/** 分类器结果（含元数据） */
export interface ClassificationResult {
  /** 分类结果 */
  classification: TaskClassification;
  /** 是否低置信度 */
  lowConfidence: boolean;
  /** 使用的模型 */
  model: string;
  /** 调用延迟 (ms) */
  latency: number;
}

// ============================================
// 默认分类（解析失败时使用）
// ============================================

const DEFAULT_CLASSIFICATION: TaskClassification = {
  type: 'general',
  complexity: 'medium',
  confidence: 0,
};

// ============================================
// 核心函数
// ============================================

/**
 * 对任务进行分类
 *
 * @param task - 任务描述
 * @param providerManager - 提供商管理器
 * @param modelOverride - 覆盖模型（默认使用 haiku）
 * @returns 分类结果
 */
export async function classifyTask(
  task: string,
  provider: ClassifierProvider,
  modelOverride?: string
): Promise<ClassificationResult> {
  const startTime = Date.now();
  const model = modelOverride ?? 'claude-haiku-4-5-20251001';

  try {
    const result = await callClassifierLLM(task, provider, model);
    const classification = parseClassification(result);
    const latency = Date.now() - startTime;

    return {
      classification,
      lowConfidence: classification.confidence < 0.5,
      model,
      latency,
    };
  } catch {
    const latency = Date.now() - startTime;
    return {
      classification: { ...DEFAULT_CLASSIFICATION },
      lowConfidence: true,
      model,
      latency,
    };
  }
}

/**
 * 调用 LLM 进行分类
 */
async function callClassifierLLM(
  task: string,
  provider: ClassifierProvider,
  model: string
): Promise<string> {
  const activeProvider = provider.getActiveProvider();

  const envVars: Record<string, string | undefined> = { ...process.env };
  if (activeProvider) {
    envVars.ANTHROPIC_BASE_URL = activeProvider.baseUrl;
    if (activeProvider.apiKey) {
      envVars.ANTHROPIC_API_KEY = activeProvider.apiKey;
    }
  }

  // Dynamic import to avoid hard dependency on claude-agent-sdk at module level
  const { query } = await import('@anthropic-ai/claude-agent-sdk');

  let responseText = '';

  for await (const message of query({
    prompt: task,
    options: {
      model,
      systemPrompt: CLASSIFICATION_SYSTEM_PROMPT,
      maxTurns: 1,
      tools: [],
      permissionMode: 'bypassPermissions',
      env: envVars,
    },
  })) {
    if (
      message &&
      typeof message === 'object' &&
      'message' in message &&
      message.message?.content
    ) {
      const content = message.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            responseText += block.text;
          }
        }
      }
    }
    // Also check for result message
    if (
      message &&
      typeof message === 'object' &&
      'result' in message &&
      message.result
    ) {
      const result = message.result;
      if (typeof result === 'string') {
        responseText += result;
      }
    }
  }

  return responseText.trim();
}

/**
 * 解析分类结果
 */
function parseClassification(text: string): TaskClassification {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { ...DEFAULT_CLASSIFICATION };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    const type = validateTaskType(parsed.type);
    const complexity = validateComplexity(parsed.complexity);
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;

    return { type, complexity, confidence };
  } catch {
    return { ...DEFAULT_CLASSIFICATION };
  }
}

/**
 * 校验任务类型
 */
function validateTaskType(value: unknown): TaskType {
  const valid: TaskType[] = ['add-feature', 'debug', 'code-review', 'refactor', 'general'];
  if (typeof value === 'string' && valid.includes(value as TaskType)) {
    return value as TaskType;
  }
  return 'general';
}

/**
 * 校验复杂度
 */
function validateComplexity(value: unknown): Complexity {
  const valid: Complexity[] = ['simple', 'medium', 'complex'];
  if (typeof value === 'string' && valid.includes(value as Complexity)) {
    return value as Complexity;
  }
  return 'medium';
}

// ============================================
// Tracer 事件辅助
// ============================================

/**
 * 生成分类器完成事件
 */
export function createClassifierEvent(
  result: ClassificationResult,
  swarmId: string
): TraceEvent {
  return {
    timestamp: Date.now(),
    type: 'classifier.complete',
    swarmId,
    metadata: {
      type: result.classification.type,
      complexity: result.classification.complexity,
      confidence: result.classification.confidence,
      model: result.model,
      latency: result.latency,
    },
  };
}

/**
 * 生成低置信度事件
 */
export function createLowConfidenceEvent(
  result: ClassificationResult,
  swarmId: string
): TraceEvent {
  return {
    timestamp: Date.now(),
    type: 'classifier.low-confidence',
    swarmId,
    metadata: {
      type: result.classification.type,
      complexity: result.classification.complexity,
      confidence: result.classification.confidence,
    },
  };
}
