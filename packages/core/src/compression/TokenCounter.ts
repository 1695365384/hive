/**
 * Token 计数器 — 模型感知的多策略计数器
 *
 * 策略优先级（按模型 ID 自动选择）：
 *   1. 注册的自定义 Tokenizer（用户通过 registerTokenizer 注入）
 *   2. tiktoken（WASM）：精确计数，支持 GPT-4/4o/3.5/o1/o3 等 OpenAI 模型
 *   3. CJK 感知估算（fallback，支持所有模型）
 *
 * tiktoken 在后台异步初始化，首次加载约 50-100ms，
 * 加载完成前透明回退到估算模式。
 */

import type { Message } from '../session/types.js';
import type { TokenCounter, TokenCounterConfig, CompressionConfig } from './types.js';
import { DEFAULT_TOKEN_COUNTER_CONFIG } from './types.js';

// ============================================
// CJK 感知的 Token 估算（fallback）
// ============================================

const CJK_REGEX = /[\u2E80-\u2EFF\u2F00-\u2FDF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3100-\u312F\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA48F\uF900-\uFAFF\uFE30-\uFE4F]/g;

function estimateTokensCJKAware(text: string, safetyFactor: number): number {
  if (!text) return 0;
  const cjkMatches = text.match(CJK_REGEX);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkCount = text.length - cjkCount;
  const rawTokens = cjkCount * 1.3 + nonCjkCount * 0.25;
  return Math.ceil(rawTokens * safetyFactor);
}

// ============================================
// 自定义 Tokenizer 注册表
// ============================================

export type TokenizerFn = (text: string) => number;

interface TokenizerEntry {
  pattern: RegExp;
  fn: TokenizerFn;
}

const customTokenizerEntries: TokenizerEntry[] = [];

/**
 * 注册自定义 Tokenizer
 *
 * 当 modelId 匹配 pattern 时，使用 fn 代替内置计数。
 *
 * @example
 * registerTokenizer(/^claude/, countWithAnthropicTokenizer)
 * registerTokenizer(/^deepseek/, countWithDeepSeekTokenizer)
 */
export function registerTokenizer(pattern: RegExp, fn: TokenizerFn): void {
  customTokenizerEntries.push({ pattern, fn });
}

// ============================================
// tiktoken 懒加载
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _tiktokenMod: any = null;
let _tiktokenReady = false;
let _tiktokenPromise: Promise<boolean> | null = null;

async function _ensureTiktoken(): Promise<boolean> {
  if (_tiktokenReady) return true;
  if (_tiktokenPromise) return _tiktokenPromise;

  _tiktokenPromise = (async () => {
    try {
      const mod = await import('tiktoken');
      _tiktokenMod = mod;
      _tiktokenReady = true;
      return true;
    } catch {
      _tiktokenReady = false;
      return false;
    }
  })();

  return _tiktokenPromise;
}

// 模块加载时立即启动后台加载
_ensureTiktoken();

/**
 * Model → tiktoken encoding 映射表
 */
const MODEL_ENCODING_MAP: [RegExp, string][] = [
  [/^gpt-4o/, 'o200k_base'],
  [/^chatgpt-4o/, 'o200k_base'],
  [/^o1/, 'o200k_base'],
  [/^o3/, 'o200k_base'],
  [/^gpt-4(?!o)/, 'cl100k_base'],
  [/^gpt-3\.5/, 'cl100k_base'],
  [/^text-embedding-3/, 'cl100k_base'],
  [/^text-embedding-ada/, 'cl100k_base'],
  [/^codegpt/, 'p50k_base'],
  [/^text-davinci/, 'p50k_base'],
  [/^code-davinci/, 'p50k_base'],
];

function resolveTiktokenEncoding(modelId: string): string | null {
  for (const [pattern, encoding] of MODEL_ENCODING_MAP) {
    if (pattern.test(modelId)) return encoding;
  }
  return null;
}

function countWithTiktoken(text: string, encodingName: string): number | null {
  if (!_tiktokenReady || !_tiktokenMod) return null;
  try {
    // get_encoding accepts encoding name, returns Tiktoken instance
    const enc = _tiktokenMod.get_encoding(encodingName);
    try {
      return enc.encode(text).length;
    } finally {
      enc.free();
    }
  } catch {
    return null;
  }
}

// ============================================
// ModelAwareTokenCounter
// ============================================

/**
 * 模型感知的 Token 计数器
 *
 * 1. 先查自定义注册的 Tokenizer
 * 2. 再查 tiktoken（模型匹配则精确计数）
 * 3. 最后回退到 CJK 估算
 */
export class ModelAwareTokenCounter implements TokenCounter {
  private readonly config: Required<Pick<TokenCounterConfig, 'mode' | 'safetyFactor'>> & { modelId?: string };
  private _initialized = false;

  constructor(config?: Partial<TokenCounterConfig>) {
    this.config = {
      mode: config?.mode ?? DEFAULT_TOKEN_COUNTER_CONFIG.mode,
      modelId: config?.modelId,
      safetyFactor: config?.safetyFactor ?? DEFAULT_TOKEN_COUNTER_CONFIG.safetyFactor ?? 1.1,
    };
  }

  /**
   * 获取当前模型 ID
   */
  get modelId(): string | undefined {
    return this.config.modelId;
  }

  /**
   * 更新模型 ID（dispatch 时动态传入）
   */
  setModelId(modelId: string | undefined): void {
    this.config.modelId = modelId;
  }

  /**
   * 确保 tiktoken 已初始化
   * 调用方可在首次计数前等待，避免第一调用使用估算
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;
    if (this.config.mode === 'estimate') {
      this._initialized = true;
      return;
    }
    await _ensureTiktoken();
    this._initialized = true;
  }

  /**
   * 计算文本的 Token 数
   */
  count(text: string): number {
    if (!text) return 0;

    // 1. 自定义注册的 Tokenizer（最高优先级）
    if (this.config.modelId) {
      for (const entry of customTokenizerEntries) {
        if (entry.pattern.test(this.config.modelId)) {
          return entry.fn(text);
        }
      }
    }

    // 2. tiktoken 精确计数
    if (this.config.mode !== 'estimate' && this.config.modelId) {
      const encodingName = resolveTiktokenEncoding(this.config.modelId);
      if (encodingName) {
        const tiktokenCount = countWithTiktoken(text, encodingName);
        if (tiktokenCount !== null) return tiktokenCount;
      }
    }

    // 3. CJK 感知估算（fallback）
    return estimateTokensCJKAware(text, this.config.safetyFactor);
  }

  /**
   * 计算消息的 Token 数
   */
  countMessage(message: Message): number {
    const roleOverhead = 4;
    const formatOverhead = 10;
    const contentTokens = this.count(message.content);
    return roleOverhead + formatOverhead + contentTokens;
  }

  /**
   * 计算消息列表的总 Token 数
   */
  countMessages(messages: Message[]): number {
    if (messages.length === 0) return 0;
    const listOverhead = 20;
    const messagesTokens = messages.reduce((sum, msg) => sum + this.countMessage(msg), 0);
    return listOverhead + messagesTokens;
  }
}

// ============================================
// 工厂函数
// ============================================

/**
 * 创建模型感知的 Token 计数器
 */
export function createTokenCounter(config?: Partial<TokenCounterConfig>): ModelAwareTokenCounter {
  return new ModelAwareTokenCounter(config);
}

/**
 * @deprecated 已重命名为 ModelAwareTokenCounter，保留别名兼容
 */
export const SimpleTokenCounter = ModelAwareTokenCounter;

// ============================================
// 工具函数
// ============================================

/**
 * 计算压缩阈值
 */
export function calculateThreshold(config: CompressionConfig): number {
  if (config.threshold > 0) return config.threshold;
  return Math.floor(config.contextWindowSize * config.thresholdPercentage);
}

/**
 * 计算有效 Budget（扣除 system + tools + maxOutputTokens）
 */
export function calculateEffectiveBudget(config: CompressionConfig): number {
  const base = calculateThreshold(config);
  const systemOverhead = config.systemPromptTokens ?? 0;
  const toolOverhead = config.toolSchemaTokens ?? 0;
  const outputReserve = config.maxOutputTokens ?? 0;
  return Math.max(base - systemOverhead - toolOverhead - outputReserve, base * 0.3);
}

/**
 * 判断是否需要压缩
 */
export function shouldCompress(
  currentTokens: number,
  messageCount: number,
  config: CompressionConfig,
): boolean {
  const threshold = calculateThreshold(config);
  if (currentTokens >= threshold) return true;
  if (messageCount >= config.summaryThreshold * 2) return true;
  return false;
}
