/**
 * Quality Gate — Parses and validates quality assessments from Critic/Arbiter agents.
 *
 * Handles JSON parsing of structured outputs, computes weighted aggregate scores,
 * and determines pass/fail against configurable thresholds.
 */

import type {
  QualityScore,
  QualityDimension,
  DimensionScore,
  ResolvedAdversarialConfig,
} from './types.js';
import { DEFAULT_QUALITY_WEIGHTS } from './types.js';

// ============================================
// JSON Parsing
// ============================================

/** Raw critic output structure (from critic.md prompt template) */
interface RawCriticOutput {
  overall_score: number;
  passed: boolean;
  dimensions: Array<{
    dimension: string;
    score: number;
    issues: string[];
    suggestions: string[];
  }>;
  critical_flaws: string[];
  summary: string;
}

/** Raw arbiter output structure (from arbiter.md prompt template) */
interface RawArbiterOutput {
  decision: 'ACCEPT' | 'REVISE' | 'REJECT';
  overall_score: number;
  final_output: string;
  changes_made: string[];
  quality_assessment: {
    overall: number;
    dimensions: Array<{
      dimension: string;
      score: number;
      rationale: string;
    }>;
    passed: boolean;
    summary: string;
  };
  revision_round_needed: boolean;
}

/** Attempt to extract JSON from text that may contain markdown fences or preamble */
function extractJson(text: string): string {
  // Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Find the first { and last } — extract the JSON object
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text.trim();
}

/** Safely parse critic JSON output (raw structure) */
function parseRawCritic(text: string): RawCriticOutput | null {
  try {
    const json = extractJson(text);
    const parsed = JSON.parse(json) as RawCriticOutput;
    if (typeof parsed.overall_score !== 'number' || !Array.isArray(parsed.dimensions)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Safely parse arbiter JSON output (raw structure) */
function parseRawArbiter(text: string): RawArbiterOutput | null {
  try {
    const json = extractJson(text);
    const parsed = JSON.parse(json) as RawArbiterOutput;
    if (!parsed.final_output || typeof parsed.quality_assessment?.overall !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ============================================
// Quality Scoring
// ============================================

/** Validate a dimension name against known quality dimensions */
function isValidDimension(d: string): d is QualityDimension {
  return ['correctness', 'completeness', 'actionability', 'security'].includes(d);
}

/** Clamp a score to [0, 1] */
function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Compute weighted overall score from dimension scores.
 * Uses default weights for any dimensions not explicitly scored.
 */
function computeOverall(dimensions: Array<{ dimension: string; score: number }>): number {
  if (dimensions.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const d of dimensions) {
    const dim = d.dimension as QualityDimension;
    const weight = DEFAULT_QUALITY_WEIGHTS[dim] ?? 0.25;
    weightedSum += clamp(d.score) * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// ============================================
// Public API
// ============================================

/**
 * Parse critic output into a QualityScore.
 * The critic provides issue-level detail; we extract what we can.
 */
export function parseCriticQuality(text: string): QualityScore | null {
  const raw = parseRawCritic(text);
  if (!raw) return null;

  const dimensions: DimensionScore[] = raw.dimensions
    .filter(d => isValidDimension(d.dimension))
    .map(d => ({
      dimension: d.dimension as QualityDimension,
      score: clamp(d.score),
      rationale: `${d.issues.join('; ')} | Suggestions: ${d.suggestions.join('; ')}`,
    }));

  const overall = raw.overall_score !== undefined
    ? clamp(raw.overall_score)
    : computeOverall(dimensions);

  return {
    overall,
    dimensions,
    passed: raw.passed,
    summary: raw.summary,
  };
}

/**
 * Parse arbiter output to extract quality assessment and final output.
 * Returns null if JSON parsing fails.
 */
export function parseArbiterOutput(text: string): {
  quality: QualityScore;
  finalOutput: string;
  decision: 'ACCEPT' | 'REVISE' | 'REJECT';
  revisionNeeded: boolean;
  changesMade: string[];
} | null {
  const raw = parseRawArbiter(text);
  if (!raw) return null;

  const qa = raw.quality_assessment;
  const dimensions: DimensionScore[] = (qa.dimensions ?? [])
    .filter((d: { dimension: string }) => isValidDimension(d.dimension))
    .map((d: { dimension: string; score: number; rationale: string }) => ({
      dimension: d.dimension as QualityDimension,
      score: clamp(d.score),
      rationale: d.rationale,
    }));

  const overall = qa.overall !== undefined
    ? clamp(qa.overall)
    : computeOverall(dimensions);

  const quality: QualityScore = {
    overall,
    dimensions,
    passed: qa.passed,
    summary: qa.summary,
  };

  return {
    quality,
    finalOutput: raw.final_output,
    decision: raw.decision,
    revisionNeeded: raw.revision_round_needed,
    changesMade: raw.changes_made ?? [],
  };
}

/**
 * Check if a quality score passes the configured threshold.
 */
export function passesQualityGate(
  quality: QualityScore,
  config: ResolvedAdversarialConfig,
): boolean {
  return quality.overall >= config.qualityThreshold;
}

/**
 * Create a default QualityScore for error/fallback cases.
 */
export function createFallbackQuality(
  output: string,
  error?: string,
): QualityScore {
  return {
    overall: 0,
    dimensions: [
      { dimension: 'correctness', score: 0, rationale: error ?? 'Quality assessment unavailable' },
      { dimension: 'completeness', score: 0, rationale: '' },
      { dimension: 'actionability', score: 0, rationale: '' },
      { dimension: 'security', score: 0, rationale: '' },
    ],
    passed: false,
    summary: error ? `Harness error: ${error}` : `Using raw output (${output.length} chars) as fallback`,
  };
}
