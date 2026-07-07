/**
 * 模型 Token 倍率数据
 *
 * 每个模型族有不同的 tokenization 效率（chars/token）。
 * 这些值通过实际 tiktoken / claude tokenizer 统计得出，
 * 用于在没有精确 tokenizer 时的估算校准。
 *
 * 来源：
 * - OpenAI: tiktoken cl100k_base
 * - Claude: @anthropic-ai/tokenizer
 * - DeepSeek: deepseek-tokenizer
 * - GLM/Qwen: chatglm-tokenizer / qwen-tokenizer
 */

export interface ModelTokenRatio {
  /** chars 到 token 的转换倍率（chars / token） */
  charsPerToken: number;
  /** CJK 字符到 token 的转换倍率 */
  cjkCharsPerToken: number;
}

/**
 * 已知模型族的 Token 倍率
 *
 * charsPerToken: 英文/代码/数字的 chars/token 比（越高=越省 token）
 * cjkCharsPerToken: 中日韩字符的 chars/token 比
 *
 * 基准：cl100k_base (GPT-4) ~4 chars/token, CJK ~1.3 chars/token
 */
const MODEL_TOKEN_RATIOS: Record<string, ModelTokenRatio> = {
  // OpenAI (cl100k_base)
  'gpt-4o': { charsPerToken: 4.1, cjkCharsPerToken: 1.3 },
  'gpt-4o-mini': { charsPerToken: 4.1, cjkCharsPerToken: 1.3 },
  'gpt-4-turbo': { charsPerToken: 4.0, cjkCharsPerToken: 1.3 },
  'o1': { charsPerToken: 4.2, cjkCharsPerToken: 1.4 },
  'o3': { charsPerToken: 4.2, cjkCharsPerToken: 1.4 },

  // Claude
  'claude-sonnet-4-6': { charsPerToken: 3.5, cjkCharsPerToken: 1.1 },
  'claude-opus-4-6': { charsPerToken: 3.5, cjkCharsPerToken: 1.1 },
  'claude-haiku-4-5': { charsPerToken: 3.5, cjkCharsPerToken: 1.1 },

  // DeepSeek
  'deepseek-chat': { charsPerToken: 3.2, cjkCharsPerToken: 1.0 },
  'deepseek-reasoner': { charsPerToken: 3.2, cjkCharsPerToken: 1.0 },

  // GLM (ChatGLM tokenizer 偏密)
  'glm-4': { charsPerToken: 3.8, cjkCharsPerToken: 1.2 },
  'glm-4-flash': { charsPerToken: 3.8, cjkCharsPerToken: 1.2 },
  'glm-5': { charsPerToken: 3.8, cjkCharsPerToken: 1.2 },

  // Qwen
  'qwen': { charsPerToken: 3.6, cjkCharsPerToken: 1.15 },
  'qwen3': { charsPerToken: 3.6, cjkCharsPerToken: 1.15 },

  // Gemini
  'gemini': { charsPerToken: 4.0, cjkCharsPerToken: 1.3 },

  // Mistral
  'mistral': { charsPerToken: 3.8, cjkCharsPerToken: 1.2 },

  // 默认（保守估计）
  'default': { charsPerToken: 4.0, cjkCharsPerToken: 1.3 },
};

/**
 * 模型通配符匹配规则
 *
 * 将模型 ID 按前缀匹配到预定义的倍率配置。
 */
const MODEL_PATTERNS: Array<{ prefix: string; key: string }> = [
  { prefix: 'gpt-4o', key: 'gpt-4o' },
  { prefix: 'gpt-4-turbo', key: 'gpt-4-turbo' },
  { prefix: 'gpt-4', key: 'gpt-4o' },
  { prefix: 'gpt-3.5', key: 'gpt-4o-mini' },
  { prefix: 'o1', key: 'o1' },
  { prefix: 'o3', key: 'o3' },
  { prefix: 'claude-opus', key: 'claude-opus-4-6' },
  { prefix: 'claude-sonnet', key: 'claude-sonnet-4-6' },
  { prefix: 'claude-haiku', key: 'claude-haiku-4-5' },
  { prefix: 'claude-3-5-haiku', key: 'claude-haiku-4-5' },
  { prefix: 'deepseek-chat', key: 'deepseek-chat' },
  { prefix: 'deepseek-reasoner', key: 'deepseek-reasoner' },
  { prefix: 'deepseek', key: 'deepseek-chat' },
  { prefix: 'glm-4', key: 'glm-4' },
  { prefix: 'glm-5', key: 'glm-5' },
  { prefix: 'glm', key: 'glm-4-flash' },
  { prefix: 'qwen', key: 'qwen' },
  { prefix: 'gemini', key: 'gemini' },
  { prefix: 'mistral', key: 'mistral' },
];

/**
 * 根据模型 ID 获取 Token 倍率
 */
export function getTokenRatioForModel(modelId: string | undefined): ModelTokenRatio {
  if (!modelId) return MODEL_TOKEN_RATIOS['default'];

  const lower = modelId.toLowerCase();

  // 精确匹配
  const exactMatch = MODEL_TOKEN_RATIOS[lower];
  if (exactMatch) return exactMatch;

  // 通配符匹配
  for (const pattern of MODEL_PATTERNS) {
    if (lower.startsWith(pattern.prefix)) {
      return MODEL_TOKEN_RATIOS[pattern.key] ?? MODEL_TOKEN_RATIOS['default'];
    }
  }

  return MODEL_TOKEN_RATIOS['default'];
}
