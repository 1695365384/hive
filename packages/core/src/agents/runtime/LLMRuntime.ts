/**
 * LLM Runtime — 统一的 LLM 执行引擎
 *
 * 基于 Vercel AI SDK 的 generateText / streamText，
 * 替代 claude-agent-sdk 的 query()。
 *
 * 设计原则：
 * - 单一入口 run(config) → Promise<RuntimeResult>
 * - streaming=false → generateText（子 Agent、分类器）
 * - streaming=true  → streamText + fullStream（对话）
 * - 模型通过 ProviderManager.getModel() 获取，兼容所有 Provider
 */

import { generateText, streamText, stepCountIs } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderManager } from '../../providers/ProviderManager.js';
import type { ModelSpec } from '../../providers/types.js';
import type {
  RuntimeConfig,
  RuntimeResult,
  StepResult,
  AgentPreset,
} from './types.js';

// ============================================
// Agent 预设
// ============================================

/**
 * 内置 Agent 预设配置
 * 注意：system prompt 由调用方通过 options.systemPrompt 传入（从 md 模板构建）
 * 'plan' 和 'evaluator' 通过 AgentConfig 中的 maxTurns 兜底。
 */
export const AGENT_PRESETS: Record<string, AgentPreset> = {
  explore: {
    maxSteps: 10,
  },
  general: {
    maxSteps: 30,
  },
};

// ============================================
// LLM Runtime
// ============================================

/**
 * 统一的 LLM 执行引擎
 */
export class LLMRuntime {
  private providerManager: ProviderManager;

  constructor(providerManager: ProviderManager) {
    this.providerManager = providerManager;
  }

  /**
   * 执行 LLM 调用
   */
  async run(config: RuntimeConfig): Promise<RuntimeResult> {
    const startTime = Date.now();
    const { model, spec } = await this.resolveModelWithSpec(config);
    if (!model) {
      return {
        text: '',
        tools: [],
        success: false,
        error: 'No available model. Check provider configuration.',
        steps: [],
        duration: Date.now() - startTime,
      };
    }

    const modelSpec = spec ? {
      contextWindow: spec.contextWindow,
      maxOutputTokens: spec.maxOutputTokens ?? 0,
      supportsTools: spec.supportsTools ?? false,
    } : undefined;

    try {
      if (config.streaming) {
        return await this.runStreaming(model, config, startTime, modelSpec);
      }
      return await this.runGenerate(model, config, startTime, modelSpec);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (err.name === 'AbortError') {
        return {
          text: '',
          tools: [],
          success: false,
          error: 'Request aborted',
          steps: [],
          duration: Date.now() - startTime,
          modelSpec,
        };
      }

      return {
        text: '',
        tools: [],
        success: false,
        error: err.message,
        steps: [],
        duration: Date.now() - startTime,
        modelSpec,
      };
    }
  }

  // ============================================
  // 非流式执行（子 Agent / 分类器）
  // ============================================

  private async runGenerate(
    model: LanguageModelV3,
    config: RuntimeConfig,
    startTime: number,
    modelSpec?: RuntimeResult['modelSpec'],
  ): Promise<RuntimeResult> {
    const result = await generateText({
      model,
      prompt: config.prompt,
      system: config.system,
      messages: config.messages as any,
      tools: config.tools,
      stopWhen: stepCountIs(config.maxSteps ?? 10),
      abortSignal: config.abortSignal,
    });

    const toolsUsed = this.collectToolsFromSteps(result.steps);

    return {
      text: result.text,
      tools: toolsUsed,
      usage: result.totalUsage
        ? {
            promptTokens: result.totalUsage.inputTokens ?? 0,
            completionTokens: result.totalUsage.outputTokens ?? 0,
          }
        : undefined,
      steps: result.steps.map(step => this.mapStepResult(step)),
      success: true,
      duration: Date.now() - startTime,
      modelSpec,
    };
  }

  // ============================================
  // 流式执行（对话）
  // ============================================

  private async runStreaming(
    model: LanguageModelV3,
    config: RuntimeConfig,
    startTime: number,
    modelSpec?: RuntimeResult['modelSpec'],
  ): Promise<RuntimeResult> {
    const result = streamText({
      model,
      prompt: config.prompt,
      system: config.system,
      messages: config.messages as any,
      tools: config.tools,
      stopWhen: stepCountIs(config.maxSteps ?? 10),
      abortSignal: config.abortSignal,
    });

    // 遍历 fullStream 事件
    for await (const chunk of result.fullStream) {
      switch (chunk.type) {
        case 'text-delta':
          config.onText?.(chunk.text);
          break;

        case 'tool-call':
          config.onToolCall?.(chunk.toolName, chunk.input);
          break;

        case 'tool-result':
          config.onToolResult?.(chunk.toolName, chunk.output);
          break;

        case 'reasoning-delta':
          config.onReasoning?.(chunk.text);
          break;

        case 'finish-step':
          config.onStepFinish?.({
            toolCalls: [],
            toolResults: [],
            isToolStep: false,
            finishReason: chunk.finishReason,
          });
          break;
      }
    }

    // 等待完整结果
    const [text, finishReason, steps, totalUsage] = await Promise.all([
      result.text,
      result.finishReason,
      result.steps,
      result.totalUsage,
    ]);

    const toolsUsed = this.collectToolsFromSteps(steps);

    return {
      text,
      tools: toolsUsed,
      usage: totalUsage
        ? {
            promptTokens: totalUsage.inputTokens ?? 0,
            completionTokens: totalUsage.outputTokens ?? 0,
          }
        : undefined,
      steps: steps.map(step => this.mapStepResult(step)),
      success: finishReason !== 'error',
      error: finishReason === 'error' ? 'Generation finished with error' : undefined,
      duration: Date.now() - startTime,
      modelSpec,
    };
  }

  // ============================================
  // 内部方法
  // ============================================

  private async resolveModelWithSpec(config: RuntimeConfig): Promise<{ model: LanguageModelV3 | null; spec: ModelSpec | null }> {
    // 直接提供 LanguageModelV3 实例（最高优先级）
    if (config.languageModel) return { model: config.languageModel, spec: null };

    // 指定了 providerId
    if (config.providerId) {
      const model = this.providerManager.getModelForProvider(config.providerId, config.model);
      return { model, spec: null };
    }

    // 使用活跃 Provider，附带 ModelSpec
    const result = await this.providerManager.getModelWithSpec(config.model);
    if (result) return { model: result.model, spec: result.spec };

    return { model: null, spec: null };
  }

  private collectToolsFromSteps(
    steps: Array<{ toolCalls: Array<{ toolName: string }> }>,
  ): string[] {
    const toolSet = new Set<string>();
    for (const step of steps) {
      for (const tc of step.toolCalls) {
        toolSet.add(tc.toolName);
      }
    }
    return Array.from(toolSet);
  }

  private mapStepResult(
    step: {
      toolCalls: Array<{ toolName: string; input: unknown }>;
      toolResults: Array<{ toolName: string; output: unknown }>;
      finishReason: string | null | undefined;
      text?: string;
    },
  ): StepResult {
    return {
      toolCalls: step.toolCalls.map(tc => ({
        toolName: tc.toolName,
        input: tc.input,
      })),
      toolResults: step.toolResults.map(tr => ({
        toolName: tr.toolName,
        result: tr.output,
      })),
      isToolStep: step.toolCalls.length > 0,
      text: step.text,
      finishReason: step.finishReason ?? null,
    };
  }
}

// ============================================
// 工厂函数
// ============================================

export function createLLMRuntime(providerManager: ProviderManager): LLMRuntime {
  return new LLMRuntime(providerManager);
}
