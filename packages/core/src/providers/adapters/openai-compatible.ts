/**
 * OpenAI 兼容适配器
 *
 * 使用 @ai-sdk/openai 创建兼容 OpenAI API 的模型实例
 * 适用于 DeepSeek、GLM、Qwen、Kimi 等国产模型
 *
 * 关键：使用 compatFetch 履历层剥离第三方代理不支持的 OpenAI 专有参数
 * （stream_options、logprobs 等），避免 400 错误。
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderConfig } from '../types.js';
import type { ProviderAdapter, ProviderType } from './base.js';
import { getProviderRegistry, getProviderInfoSync, type ProviderInfo } from '../metadata/provider-registry.js';

/**
 * 兼容性 fetch — 移除第三方 OpenAI 兼容端点不支持的参数
 *
 * 解决两类问题：
 * 1. 顶层参数：stream_options、logprobs 等 OpenAI 专有字段
 * 2. 工具 schema：Zod v4 序列化时自动加的 $schema、$ref 等 JSON Schema 元数据，
 *    OpenAI function calling 格式不支持，严格代理（如 DeepSeek）返回 400
 */
function compatFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let cleanedBody: string | null = null;

  if (init?.body && typeof init.body === 'string') {
    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      let modified = false;

      // === 顶层参数清理 ===

      // stream_options — OpenAI 专有，很多代理不支持
      if ('stream_options' in body) {
        delete body.stream_options;
        modified = true;
      }

      // logprobs / top_logprobs — OpenAI 专有
      if ('logprobs' in body) {
        delete body.logprobs;
        modified = true;
      }
      if ('top_logprobs' in body) {
        delete body.top_logprobs;
        modified = true;
      }

      // === 工具 schema 清理 ===

      if (Array.isArray(body.tools)) {
        for (const tool of body.tools) {
          const fn = (tool as Record<string, unknown>)?.function as Record<string, unknown> | undefined;
          const params = fn?.parameters as Record<string, unknown> | undefined;
          if (params && typeof params === 'object') {
            // $schema — Zod v4 自动加的 JSON Schema 元数据
            if ('$schema' in params) {
              delete params.$schema;
              modified = true;
            }
            // oneOf / anyOf — DeepSeek 等国产模型不支持，展开为扁平 object schema
            if ('oneOf' in params || 'anyOf' in params) {
              const flattened = flattenOneOf(params);
              Object.keys(params).forEach(k => delete params[k]);
              Object.assign(params, flattened);
              modified = true;
            }
            // 递归清理嵌套 schema
            cleanSchemaRecursively(params);
          }
        }
      }

      if (modified) {
        cleanedBody = JSON.stringify(body);
        init = { ...init, body: cleanedBody };
      } else {
        cleanedBody = init.body;
      }
    } catch {
      // body 不是 JSON，跳过
    }
  }

  const url = typeof input === 'string' ? input : input.toString();

  return globalThis.fetch(input, init).then(async (response) => {
    if (!response.ok) {
      // LLM API 报错 — 打印完整请求和响应，方便排查
      const respClone = response.clone();
      let respText = '';
      try {
        respText = await respClone.text();
      } catch {}

      const reqPreview = cleanedBody
        ? cleanedBody.length > 2000
          ? cleanedBody.slice(0, 2000) + ` ...(truncated, total ${cleanedBody.length} chars)`
          : cleanedBody
        : '(empty)';

      console.error(
        `[llm-fetch] HTTP ${response.status} ${response.statusText}\n` +
        `  URL: ${url}\n` +
        `  Model: ${(JSON.parse(cleanedBody ?? '{}') as Record<string, unknown>)?.model ?? '?'}\n` +
        `  Response: ${respText.slice(0, 1000)}\n` +
        `  Request body: ${reqPreview}`
      );
    }
    return response;
  });
}

/**
 * 将 oneOf/anyOf schema 展开为扁平的 object schema
 *
 * DeepSeek 等国产模型不支持工具参数中的 oneOf/anyOf。
 * 此函数将多个 variant 合并为单个 object：
 * - 合并所有 variant 的 properties
 * - discriminator 字段（如 command）转为 enum
 * - required 取所有 variant 的交集
 */
function flattenOneOf(schema: Record<string, unknown>): Record<string, unknown> {
  const variants = (schema.oneOf ?? schema.anyOf) as unknown[];
  if (!Array.isArray(variants)) return schema;

  const mergedProps: Record<string, unknown> = {};
  const allRequiredSets: string[][] = [];
  let discriminatorKey: string | null = null;
  const discriminatorValues: unknown[] = [];

  for (const variant of variants) {
    if (!variant || typeof variant !== 'object') continue;
    const v = variant as Record<string, unknown>;
    const vProps = v.properties as Record<string, unknown> | undefined;
    if (!vProps) continue;

    // 合并 properties
    for (const [key, val] of Object.entries(vProps)) {
      if (!(key in mergedProps)) {
        mergedProps[key] = val;
      }
    }

    // 收集 required
    const vRequired = Array.isArray(v.required) ? v.required as string[] : [];
    allRequiredSets.push(vRequired);

    // 找 discriminator（有 const 值的字段）
    if (!discriminatorKey) {
      for (const [key, val] of Object.entries(vProps)) {
        if (val && typeof val === 'object' && 'const' in (val as Record<string, unknown>)) {
          discriminatorKey = key;
          break;
        }
      }
    }
    // 收集 discriminator 值
    if (discriminatorKey && vProps[discriminatorKey]) {
      const prop = vProps[discriminatorKey] as Record<string, unknown>;
      if ('const' in prop) {
        discriminatorValues.push(prop.const);
      }
    }
  }

  // required = 所有 variant 的交集
  const required = allRequiredSets.length > 0
    ? allRequiredSets.reduce((acc, set) => acc.filter(r => set.includes(r)))
    : [];

  // 构建 discriminator 的 enum
  if (discriminatorKey && discriminatorValues.length > 0) {
    const discProp = mergedProps[discriminatorKey] as Record<string, unknown>;
    if (discProp) {
      delete discProp.const;
      discProp.type = 'string';
      discProp.enum = discriminatorValues;
    }
  }

  // 递归清理合并后的 properties
  for (const val of Object.values(mergedProps)) {
    if (val && typeof val === 'object') {
      cleanSchemaRecursively(val as Record<string, unknown>);
    }
  }

  return {
    type: 'object',
    properties: mergedProps,
    required,
  };
}

/**
 * 递归清理 JSON Schema 中的 Zod/JSON Schema 元数据
 * 移除 $schema、$ref、$defs 等 OpenAI function calling 不支持的字段
 */
function cleanSchemaRecursively(obj: Record<string, unknown>): void {
  delete obj.$schema;

  if ('properties' in obj && typeof obj.properties === 'object' && obj.properties !== null) {
    const props = obj.properties as Record<string, unknown>;
    for (const key of Object.keys(props)) {
      const prop = props[key];
      if (prop && typeof prop === 'object') {
        cleanSchemaRecursively(prop as Record<string, unknown>);
      }
    }
  }

  if ('items' in obj && typeof obj.items === 'object' && obj.items !== null) {
    cleanSchemaRecursively(obj.items as Record<string, unknown>);
  }

  // oneOf / anyOf / allOf 内部也可能有 $schema
  for (const key of ['oneOf', 'anyOf', 'allOf']) {
    if (key in obj && Array.isArray(obj[key])) {
      for (const item of obj[key] as unknown[]) {
        if (item && typeof item === 'object') {
          cleanSchemaRecursively(item as Record<string, unknown>);
        }
      }
    }
  }
}

/**
 * OpenAI 兼容适配器实现
 */
export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'openai-compatible';

  private readonly providerKey: string;
  private cachedProviderInfo: ProviderInfo | null | undefined = undefined;

  constructor(providerKey?: string) {
    this.providerKey = providerKey?.toLowerCase() || '';
  }

  /**
   * 获取提供商信息（延迟加载）
   */
  private getProviderInfo(): ProviderInfo | null {
    if (this.cachedProviderInfo !== undefined) {
      return this.cachedProviderInfo;
    }

    // 使用同步方法获取（先从静态 fallback，可能从动态数据）
    this.cachedProviderInfo = getProviderInfoSync(this.providerKey);
    return this.cachedProviderInfo;
  }

  /**
   * 异步获取提供商信息（从 models.dev 动态加载）
   */
  private async getProviderInfoAsync(): Promise<ProviderInfo | null> {
    if (this.cachedProviderInfo !== undefined) {
      return this.cachedProviderInfo;
    }

    const registry = getProviderRegistry();
    this.cachedProviderInfo = await registry.getProviderInfo(this.providerKey);
    return this.cachedProviderInfo;
  }

  createModel(config: ProviderConfig, modelId?: string): LanguageModelV3 {
    const providerInfo = this.getProviderInfo();

    // 确定使用的模型
    const model = modelId || config.model || this.getDefaultModel();

    // 优先级：config.baseUrl > providerInfo.baseUrl
    const baseUrl = config.baseUrl || providerInfo?.baseUrl;

    if (!baseUrl) {
      throw new Error(`OpenAI 兼容适配器需要配置 baseUrl: ${config.id}`);
    }

    const openai = createOpenAI({
      baseURL: baseUrl,
      apiKey: config.apiKey,
      fetch: compatFetch,
    });

    // 国产模型（GLM、DeepSeek、Qwen、Kimi 等）只支持 Chat Completions API，
    // 不支持 OpenAI Responses API。使用 .chat() 而非直接调用（后者走 Responses API）。
    return openai.chat(model as any);
  }

  getDefaultModel(): string {
    const providerInfo = this.getProviderInfo();
    return providerInfo?.defaultModel || 'gpt-4o';
  }

  getProviderId(): string {
    const providerInfo = this.getProviderInfo();
    return providerInfo?.providerId || this.providerKey || 'unknown';
  }

  validateConfig(config: ProviderConfig): boolean {
    const providerInfo = this.getProviderInfo();
    // 需要 baseUrl（来自配置或已知提供商）和 apiKey
    return !!(config.baseUrl || providerInfo?.baseUrl) && !!config.apiKey;
  }

  /**
   * 获取提供商的 API 基础 URL
   */
  getBaseUrl(): string | undefined {
    return this.getProviderInfo()?.baseUrl;
  }

  /**
   * 获取提供商的环境变量 Key
   */
  getEnvKeys(): string[] {
    return this.getProviderInfo()?.envKeys || [];
  }
}

/**
 * 创建 OpenAI 兼容适配器实例
 */
export function createOpenAICompatibleAdapter(providerKey?: string): OpenAICompatibleAdapter {
  return new OpenAICompatibleAdapter(providerKey);
}

/**
 * 获取已知提供商列表（异步版本）
 */
export async function getKnownProviders(): Promise<string[]> {
  const registry = getProviderRegistry();
  return registry.getKnownProviderIds();
}

/**
 * 获取已知提供商列表（同步版本，使用静态数据）
 */
export function getKnownProvidersSync(): string[] {
  const registry = getProviderRegistry();
  // 返回静态 fallback 中的提供商
  return [
    'deepseek', 'glm', 'qwen', 'kimi', 'ernie', 'openrouter',
    'litellm', 'groq', 'anthropic', 'openai', 'google',
  ];
}

/**
 * 检查是否是已知的 OpenAI 兼容提供商
 */
export function isKnownProvider(providerId: string): boolean {
  const registry = getProviderRegistry();
  return registry.isKnownProvider(providerId);
}
