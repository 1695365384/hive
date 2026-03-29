/**
 * 共享 LLM 分类工具
 *
 * 为 dispatch/classifier 提供 LLM 调用逻辑。
 * 使用 Vercel AI SDK generateText()。
 */

import { generateText } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';

// ============================================
// 提供商接口
// ============================================

/**
 * 分类器所需的提供商接口
 */
export interface ClassifierProvider {
  /** 获取当前活跃的提供商 */
  getActiveProvider(): { baseUrl: string; apiKey?: string } | null;
  /** 获取 AI SDK 模型实例 */
  getModel(modelId?: string): LanguageModelV3 | null;
}

// ============================================
// LLM 调用
// ============================================

/** 分类器 LLM 调用默认超时（10 秒） */
const DEFAULT_CLASSIFIER_TIMEOUT = 10_000;

/**
 * 调用 LLM 进行分类
 *
 * @param prompt - 用户输入
 * @param systemPrompt - 系统提示
 * @param provider - 提供商
 * @param model - 模型 ID
 * @param timeoutMs - 超时时间（毫秒），默认 10s
 * @returns LLM 原始文本响应
 * @throws 超时或网络错误
 */
export async function callClassifierLLM(
  prompt: string,
  systemPrompt: string,
  provider: ClassifierProvider,
  model: string,
  timeoutMs = DEFAULT_CLASSIFIER_TIMEOUT,
): Promise<string> {
  const modelInstance = provider.getModel(model);

  if (!modelInstance) {
    throw new Error(`No model available for classifier (model: ${model})`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await generateText({
      model: modelInstance,
      prompt,
      system: systemPrompt,
      stopWhen: undefined, // 单步，不执行工具
      abortSignal: controller.signal,
    });

    return result.text.trim();
  } finally {
    clearTimeout(timer);
  }
}

// ============================================
// JSON 解析
// ============================================

/**
 * 从 LLM 响应中提取 JSON 对象
 *
 * 使用平衡括号匹配，避免贪婪正则匹配到多余的 `}`。
 *
 * @param text - LLM 响应文本
 * @returns 解析后的对象，失败返回 null
 */
export function extractJSON<T>(text: string): T | null {
  // 找到第一个 `{` 的位置
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }

  // 从第一个 `{` 开始，用平衡括号找到对应的 `}`
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let escaped = false;
  let end = -1;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (inString) {
      if (ch === '\\') {
        escaped = true;
      } else if (ch === stringChar) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end === -1) {
    return null;
  }

  try {
    return JSON.parse(text.slice(start, end)) as T;
  } catch {
    return null;
  }
}
