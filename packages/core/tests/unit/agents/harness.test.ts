/**
 * Adversarial Harness 单元测试
 *
 * 覆盖 quality-gate 的 JSON 解析、加权评分、质量门控判定
 * 以及 AdversarialHarness 在 mocked runner 下的循环行为。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseCriticQuality,
  parseArbiterOutput,
  passesQualityGate,
  createFallbackQuality,
} from '../../../src/agents/harness/quality-gate.js';
import { AdversarialHarness } from '../../../src/agents/harness/AdversarialHarness.js';
import type {
  ResolvedAdversarialConfig,
  QualityScore,
} from '../../../src/agents/harness/types.js';
import type { AgentResult } from '../../../src/agents/core/types.js';

// ============================================
// Helpers
// ============================================

const VALID_CONFIG: ResolvedAdversarialConfig = {
  maxRounds: 3,
  qualityThreshold: 0.7,
  streaming: true,
};

/** 构造一个合法的 critic JSON 输出 */
function criticJson(overrides: Partial<{
  overall_score: number;
  passed: boolean;
  dimensions: Array<{ dimension: string; score: number; issues: string[]; suggestions: string[] }>;
}> = {}): string {
  return JSON.stringify({
    overall_score: 0.8,
    passed: true,
    dimensions: [
      { dimension: 'correctness', score: 0.9, issues: [], suggestions: [] },
      { dimension: 'completeness', score: 0.8, issues: ['missing edge case'], suggestions: ['add null check'] },
      { dimension: 'actionability', score: 0.7, issues: [], suggestions: [] },
      { dimension: 'security', score: 0.8, issues: [], suggestions: [] },
    ],
    critical_flaws: [],
    summary: 'Good output with minor improvements needed',
    ...overrides,
  });
}

/** 构造一个合法的 arbiter JSON 输出 */
function arbiterJson(overrides: Partial<{
  decision: string;
  overall_score: number;
  final_output: string;
  revision_round_needed: boolean;
  quality_assessment: { overall: number; passed: boolean; summary: string };
}> = {}): string {
  return JSON.stringify({
    decision: 'ACCEPT',
    overall_score: 0.85,
    final_output: '# Final integrated output\n\nImproved result here.',
    changes_made: ['added null check', 'improved error handling'],
    quality_assessment: {
      overall: 0.85,
      dimensions: [
        { dimension: 'correctness', score: 0.9, rationale: 'no errors' },
        { dimension: 'completeness', score: 0.85, rationale: 'all covered' },
        { dimension: 'actionability', score: 0.8, rationale: 'actionable' },
        { dimension: 'security', score: 0.85, rationale: 'safe' },
      ],
      passed: true,
      summary: 'High quality output',
    },
    revision_round_needed: false,
    ...overrides,
  });
}

// ============================================
// parseCriticQuality
// ============================================

describe('parseCriticQuality', () => {
  it('should parse valid critic JSON', () => {
    const result = parseCriticQuality(criticJson());
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(0.8);
    expect(result!.passed).toBe(true);
    expect(result!.dimensions).toHaveLength(4);
    expect(result!.dimensions[0].dimension).toBe('correctness');
  });

  it('should parse critic JSON wrapped in markdown fence', () => {
    const wrapped = '```json\n' + criticJson() + '\n```';
    const result = parseCriticQuality(wrapped);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(0.8);
  });

  it('should parse critic JSON with preamble text', () => {
    const withPreamble = 'Here is my review:\n' + criticJson();
    const result = parseCriticQuality(withPreamble);
    expect(result).not.toBeNull();
  });

  it('should return null for invalid JSON', () => {
    expect(parseCriticQuality('not json at all')).toBeNull();
  });

  it('should return null for JSON missing required fields', () => {
    expect(parseCriticQuality(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });

  it('should clamp scores to [0, 1]', () => {
    const json = criticJson({
      overall_score: 1.5,
      dimensions: [
        { dimension: 'correctness', score: 2.0, issues: [], suggestions: [] },
        { dimension: 'completeness', score: -0.5, issues: [], suggestions: [] },
        { dimension: 'actionability', score: 0.5, issues: [], suggestions: [] },
        { dimension: 'security', score: 0.5, issues: [], suggestions: [] },
      ],
    });
    const result = parseCriticQuality(json);
    expect(result!.overall).toBe(1); // clamped
    expect(result!.dimensions[0].score).toBe(1); // clamped
    expect(result!.dimensions[1].score).toBe(0); // clamped
  });
});

// ============================================
// parseArbiterOutput
// ============================================

describe('parseArbiterOutput', () => {
  it('should parse valid arbiter JSON', () => {
    const result = parseArbiterOutput(arbiterJson());
    expect(result).not.toBeNull();
    expect(result!.decision).toBe('ACCEPT');
    expect(result!.finalOutput).toContain('Final integrated output');
    expect(result!.quality.overall).toBe(0.85);
    expect(result!.revisionNeeded).toBe(false);
    expect(result!.changesMade).toHaveLength(2);
  });

  it('should parse arbiter JSON wrapped in markdown fence', () => {
    const wrapped = '```json\n' + arbiterJson() + '\n```';
    expect(parseArbiterOutput(wrapped)).not.toBeNull();
  });

  it('should return null for invalid JSON', () => {
    expect(parseArbiterOutput('invalid')).toBeNull();
  });

  it('should return null when final_output is missing', () => {
    const bad = JSON.stringify({ decision: 'ACCEPT', quality_assessment: { overall: 0.8 } });
    expect(parseArbiterOutput(bad)).toBeNull();
  });

  it('should clamp overall score', () => {
    const json = arbiterJson({
      overall_score: 5,
      quality_assessment: { overall: 5, passed: true, summary: 'x' },
    });
    const result = parseArbiterOutput(json);
    expect(result!.quality.overall).toBe(1);
  });
});

// ============================================
// passesQualityGate
// ============================================

describe('passesQualityGate', () => {
  it('should return true when score >= threshold', () => {
    const q: QualityScore = { overall: 0.7, dimensions: [], passed: true, summary: '' };
    expect(passesQualityGate(q, VALID_CONFIG)).toBe(true);
  });

  it('should return false when score < threshold', () => {
    const q: QualityScore = { overall: 0.69, dimensions: [], passed: true, summary: '' };
    expect(passesQualityGate(q, VALID_CONFIG)).toBe(false);
  });

  it('should handle exact threshold boundary', () => {
    const q: QualityScore = { overall: 0.7, dimensions: [], passed: true, summary: '' };
    expect(passesQualityGate(q, { ...VALID_CONFIG, qualityThreshold: 0.7 })).toBe(true);
  });
});

// ============================================
// createFallbackQuality
// ============================================

describe('createFallbackQuality', () => {
  it('should create a zero-score quality', () => {
    const q = createFallbackQuality('some output');
    expect(q.overall).toBe(0);
    expect(q.passed).toBe(false);
    expect(q.dimensions).toHaveLength(4);
  });

  it('should include error in rationale when provided', () => {
    const q = createFallbackQuality('', 'parse failed');
    expect(q.dimensions[0].rationale).toContain('parse failed');
    expect(q.summary).toContain('parse failed');
  });
});

// ============================================
// AdversarialHarness (with mocked runner)
// ============================================

// Mock the runner module so harness.run() doesn't make real LLM calls
vi.mock('../../../src/agents/core/runner.js', () => {
  return {
    createAgentRunner: vi.fn(() => ({
      execute: vi.fn(),
    })),
    AgentRunner: vi.fn(),
  };
});

import { createAgentRunner } from '../../../src/agents/core/runner.js';

describe('AdversarialHarness', () => {
  let harness: AdversarialHarness;
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute = vi.fn();
    (createAgentRunner as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: mockExecute,
    });
    // ProviderManager stub — harness only uses it to construct runner
    harness = new AdversarialHarness({} as any);
  });

  it('should exit early when arbiter accepts on round 1', async () => {
    // Critic call (1st execute) → returns critique JSON
    // Arbiter call (2nd execute) → returns ACCEPT with high quality
    mockExecute
      .mockResolvedValueOnce({ text: criticJson({ overall_score: 0.85, passed: true }), tools: [], success: true } as AgentResult)
      .mockResolvedValueOnce({ text: arbiterJson({ decision: 'ACCEPT', quality_assessment: { overall: 0.9, passed: true, summary: 'great' } }), tools: [], success: true } as AgentResult);

    const result = await harness.run('do task', 'thesis output', { maxRounds: 3, qualityThreshold: 0.7 });

    expect(result.success).toBe(true);
    expect(result.totalRounds).toBe(1);
    expect(result.quality.overall).toBe(0.9);
    expect(mockExecute).toHaveBeenCalledTimes(2); // critic + arbiter
  });

  it('should loop when quality is below threshold', async () => {
    // Round 1: critic + arbiter (REVISE, score 0.4)
    // Round 2: critic + arbiter (ACCEPT, score 0.8)
    mockExecute
      .mockResolvedValueOnce({ text: criticJson(), tools: [], success: true } as AgentResult)
      .mockResolvedValueOnce({ text: arbiterJson({
        decision: 'REVISE',
        revision_round_needed: true,
        quality_assessment: { overall: 0.4, passed: false, summary: 'needs work' },
      }), tools: [], success: true } as AgentResult)
      .mockResolvedValueOnce({ text: criticJson(), tools: [], success: true } as AgentResult)
      .mockResolvedValueOnce({ text: arbiterJson({
        decision: 'ACCEPT',
        revision_round_needed: false,
        quality_assessment: { overall: 0.8, passed: true, summary: 'good now' },
      }), tools: [], success: true } as AgentResult);

    const result = await harness.run('do task', 'thesis output', { maxRounds: 3, qualityThreshold: 0.7 });

    expect(result.success).toBe(true);
    expect(result.totalRounds).toBe(2);
    expect(mockExecute).toHaveBeenCalledTimes(4); // 2 rounds × 2 calls
  });

  it('should stop at maxRounds even if quality not reached', async () => {
    // Every arbiter returns low quality → should hit maxRounds
    const lowArbiter = { text: arbiterJson({
      decision: 'REVISE',
      revision_round_needed: true,
      quality_assessment: { overall: 0.3, passed: false, summary: 'still bad' },
    }), tools: [], success: true } as AgentResult;
    const critic = { text: criticJson(), tools: [], success: true } as AgentResult;

    for (let i = 0; i < 6; i++) {
      mockExecute.mockResolvedValueOnce(i % 2 === 0 ? critic : lowArbiter);
    }

    const result = await harness.run('do task', 'thesis output', { maxRounds: 3, qualityThreshold: 0.9 });

    expect(result.success).toBe(false);
    expect(result.totalRounds).toBe(3);
  });

  it('should invoke callbacks at each phase', async () => {
    mockExecute
      .mockResolvedValueOnce({ text: criticJson(), tools: [], success: true } as AgentResult)
      .mockResolvedValueOnce({ text: arbiterJson({
        quality_assessment: { overall: 0.9, passed: true, summary: 'ok' },
      }), tools: [], success: true } as AgentResult);

    const onRoundStart = vi.fn();
    const onThesisComplete = vi.fn();
    const onAntithesisComplete = vi.fn();
    const onSynthesisComplete = vi.fn();
    const onRoundComplete = vi.fn();
    const onComplete = vi.fn();

    await harness.run('task', 'output', { maxRounds: 1 }, {
      onRoundStart,
      onThesisComplete,
      onAntithesisComplete,
      onSynthesisComplete,
      onRoundComplete,
      onComplete,
    });

    expect(onRoundStart).toHaveBeenCalledWith(1);
    expect(onThesisComplete).toHaveBeenCalledTimes(1);
    expect(onAntithesisComplete).toHaveBeenCalledTimes(1);
    expect(onSynthesisComplete).toHaveBeenCalledTimes(1);
    expect(onRoundComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('should handle arbiter returning unparseable output (fallback)', async () => {
    mockExecute
      .mockResolvedValueOnce({ text: criticJson(), tools: [], success: true } as AgentResult)
      .mockResolvedValueOnce({ text: 'this is not valid json', tools: [], success: true } as AgentResult);

    const result = await harness.run('task', 'output', { maxRounds: 1, qualityThreshold: 0.5 });

    // Should not throw; should use fallback
    expect(result.success).toBe(false);
    expect(result.quality.overall).toBe(0);
  });
});
