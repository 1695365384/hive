/**
 * Model pricing unit tests
 */

import { describe, it, expect } from 'vitest';
import { getModelPricing, MODEL_PRICING } from '../../../src/providers/metadata/pricing.js';

describe('getModelPricing', () => {
  it('should return correct pricing for claude-haiku-4-5', () => {
    const pricing = getModelPricing('claude-haiku-4-5');
    expect(pricing).not.toBeNull();
    expect(pricing!.input).toBe(0.25);
    expect(pricing!.output).toBe(1.25);
  });

  it('should return correct pricing for claude-sonnet-4-6', () => {
    const pricing = getModelPricing('claude-sonnet-4-6');
    expect(pricing).not.toBeNull();
    expect(pricing!.input).toBe(3.0);
    expect(pricing!.output).toBe(15.0);
  });

  it('should return correct pricing for deepseek-chat', () => {
    const pricing = getModelPricing('deepseek-chat');
    expect(pricing).not.toBeNull();
    expect(pricing!.input).toBe(0.14);
    expect(pricing!.output).toBe(0.28);
  });

  it('should return correct pricing for glm-4-flash', () => {
    const pricing = getModelPricing('glm-4-flash');
    expect(pricing).not.toBeNull();
    expect(pricing!.input).toBe(0.1);
    expect(pricing!.output).toBe(0.1);
  });

  it('should return correct pricing for moonshot-v1-8k', () => {
    const pricing = getModelPricing('moonshot-v1-8k');
    expect(pricing).not.toBeNull();
    expect(pricing!.input).toBe(0.12);
    expect(pricing!.output).toBe(0.12);
  });

  it('should return null for unknown model', () => {
    const pricing = getModelPricing('nonexistent-model');
    expect(pricing).toBeNull();
  });

  it('should return null for empty string', () => {
    const pricing = getModelPricing('');
    expect(pricing).toBeNull();
  });
});

describe('MODEL_PRICING', () => {
  it('should contain exactly 5 models', () => {
    expect(Object.keys(MODEL_PRICING)).toHaveLength(5);
  });

  it('should have all positive values', () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.input).toBeGreaterThan(0);
      expect(pricing.output).toBeGreaterThan(0);
    }
  });
});
