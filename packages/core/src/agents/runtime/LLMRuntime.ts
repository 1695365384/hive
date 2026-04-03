/**
 * LLM Runtime — 统一的 LLM 执行引擎
 *
 * 基于 Vercel AI SDK 的 generateText / streamText，
 * 替代 claude-agent-sdk 的 query()。
 *
 * 设计原则：
 * - run(config) → Promise<RuntimeResult>（非流式，子 Agent、分类器）
 * - stream(config) → AsyncGenerator<StreamEvent, RuntimeResult>（流式，对话）
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
  StreamEvent,
  StreamHandle,
} from './types.js';

// ============================================
// Agent 预设
// ============================================

/**
 * 内置 Agent 预设配置
 * 注意：system prompt 由调用方通过 options.systemPrompt 传入（从 md 模板构建）
 * 'plan' 通过 AgentConfig 中的 maxTurns 兜底。
 */
export const AGENT_PRESETS: Record<string, AgentPreset> = {
  explore: {
    maxSteps: 10,
  },
  plan: {
    maxSteps: 15,
  },
  general: {
    maxSteps: 15,
  },
  schedule: {
    maxSteps: 10,
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
   * 执行 LLM 调用（非流式）
   */
  async run(config: RuntimeConfig): Promise<RuntimeResult> {
    const startTime = Date.now();
    const { model, spec } = await this.resolveModelWithSpec(config);
    if (!model) {
      return this.buildErrorResult(startTime, 'No available model. Check provider configuration.');
    }

    const modelSpec = spec ? {
      contextWindow: spec.contextWindow,
      maxOutputTokens: spec.maxOutputTokens ?? 0,
      supportsTools: spec.supportsTools ?? false,
    } : undefined;

    try {
      return await this.runGenerate(model, config, startTime, modelSpec);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (err.name === 'AbortError') {
        return this.buildErrorResult(startTime, 'Request aborted', modelSpec);
      }

      return this.buildErrorResult(startTime, err.message, modelSpec);
    }
  }

  // ============================================
  // 流式生成器模式（async generator）
  // ============================================

  /**
   * 以 async generator 模式执行 LLM 流式调用
   *
   * 返回 StreamHandle，包含事件生成器和结果 Promise。
   * - events: 用 for await 消费中间事件
   * - result: 在所有事件 yield 完成后 resolve 为 RuntimeResult
   *
   * @example
   * ```ts
   * const { events, result } = runtime.stream({ prompt: 'hello', ... });
   * for await (const event of events) {
   *   if (event.type === 'text-delta') process.stdout.write(event.text);
   * }
   * const final = await result; // RuntimeResult
   * ```
   */
  stream(config: RuntimeConfig): StreamHandle {
    let resolveResult!: (result: RuntimeResult) => void;
    let rejectResult!: (error: Error) => void;
    let resultResolved = false;

    const resultPromise = new Promise<RuntimeResult>((resolve, reject) => {
      resolveResult = (result: RuntimeResult) => {
        resultResolved = true;
        resolve(result);
      };
      rejectResult = (error: Error) => {
        resultResolved = true;
        reject(error);
      };
    });

    const startTime = Date.now();

    const self = this;
    const events = (async function* (): AsyncGenerator<StreamEvent> {
      try {
        const { model, spec } = await self.resolveModelWithSpec(config);
        const modelSpec = spec ? {
          contextWindow: spec.contextWindow,
          maxOutputTokens: spec.maxOutputTokens ?? 0,
          supportsTools: spec.supportsTools ?? false,
        } : undefined;

        if (!model) {
          resolveResult(self.buildErrorResult(startTime, 'No available model. Check provider configuration.', modelSpec));
          return;
        }

        const streamResult = streamText({
          model,
          prompt: config.prompt,
          system: config.system,
          messages: config.messages as any,
          tools: config.tools,
          stopWhen: stepCountIs(config.maxSteps ?? 10),
          abortSignal: config.abortSignal,
        });

        try {
          for await (const chunk of streamResult.fullStream) {
            switch (chunk.type) {
              case 'text-delta':
                yield { type: 'text-delta' as const, text: chunk.text };
                break;

              case 'tool-call':
                yield { type: 'tool-call' as const, toolName: chunk.toolName, input: chunk.input };
                break;

              case 'tool-result':
                yield { type: 'tool-result' as const, toolName: chunk.toolName, output: chunk.output };
                break;

              case 'reasoning-delta':
                yield { type: 'reasoning' as const, text: chunk.text };
                break;

              case 'finish-step':
                yield {
                  type: 'step-finish' as const,
                  step: {
                    toolCalls: [],
                    toolResults: [],
                    isToolStep: false,
                    finishReason: chunk.finishReason,
                  },
                };
                break;
            }
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          if (err.name === 'AbortError') {
            resolveResult(self.buildErrorResult(startTime, 'Request aborted', modelSpec));
            return;
          }
          resolveResult(self.buildErrorResult(startTime, err.message, modelSpec));
          return;
        }

        // 等待完整结果
        const [text, finishReason, steps, totalUsage] = await Promise.all([
          streamResult.text,
          streamResult.finishReason,
          streamResult.steps,
          streamResult.totalUsage,
        ]);

        const toolsUsed = self.collectToolsFromSteps(steps);

        resolveResult({
          text,
          tools: toolsUsed,
          usage: totalUsage
            ? {
                promptTokens: totalUsage.inputTokens ?? 0,
                completionTokens: totalUsage.outputTokens ?? 0,
              }
            : undefined,
          steps: steps.map(step => self.mapStepResult(step)),
          success: finishReason !== 'error',
          error: finishReason === 'error' ? 'Generation finished with error' : undefined,
          duration: Date.now() - startTime,
          modelSpec,
        });
      } finally {
        // 消费者 break for-await 循环后，async generator 被 GC
        // 但 resultPromise 可能永远 pending，这里确保它被 reject
        if (!resultResolved) {
          rejectResult(new Error('Stream consumer exited early'));
        }
      }
    })();

    return { events, result: resultPromise };
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
  // 内部方法
  // ============================================

  private buildErrorResult(
    startTime: number,
    error: string,
    modelSpec?: RuntimeResult['modelSpec'],
  ): RuntimeResult {
    return {
      text: '',
      tools: [],
      success: false,
      error,
      steps: [],
      duration: Date.now() - startTime,
      modelSpec,
    };
  }

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
