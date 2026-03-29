/**
 * Model pricing data
 *
 * Cost per 1M tokens in USD. Converted to per-1K tokens for calculation.
 */

// ============================================
// Types
// ============================================

/**
 * Model pricing (cost per 1K tokens in USD)
 */
export interface ModelPricing {
  input: number;
  output: number;
}

// ============================================
// Pricing data (per 1M tokens)
// ============================================

/**
 * MODEL_PRICING: cost per 1M tokens in USD
 *
 * Source: official provider pricing pages (as of 2026-03).
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-haiku-4-5': { input: 0.25, output: 1.25 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'glm-4-flash': { input: 0.1, output: 0.1 },
  'moonshot-v1-8k': { input: 0.12, output: 0.12 },
};

// ============================================
// Lookup
// ============================================

/**
 * Get pricing for a model by ID.
 *
 * @param modelId - The model identifier (e.g., 'claude-haiku-4-5')
 * @returns Pricing per 1M tokens, or null if model not found
 */
export function getModelPricing(modelId: string): ModelPricing | null {
  return MODEL_PRICING[modelId] ?? null;
}
