/**
 * Adversarial Harness Types
 *
 * Triadic adversarial network: Thesis → Antithesis → Synthesis
 * with quality-gated iterative refinement.
 */

import type { AgentResult } from '../core/types.js';

// ============================================
// Quality Scoring
// ============================================

/** Quality dimension identifiers */
export type QualityDimension = 'correctness' | 'completeness' | 'actionability' | 'security';

/** Per-dimension quality score (0.0 – 1.0) */
export interface DimensionScore {
  dimension: QualityDimension;
  score: number;
  rationale: string;
}

/** Aggregate quality assessment */
export interface QualityScore {
  /** Overall score (weighted average, 0.0 – 1.0) */
  overall: number;
  /** Per-dimension breakdown */
  dimensions: DimensionScore[];
  /** Whether the output passes the quality threshold */
  passed: boolean;
  /** Summary of what passed/failed */
  summary: string;
}

// ============================================
// Round Results
// ============================================

/** Result from the Thesis (executor) phase */
export interface ThesisResult {
  /** The raw Worker result */
  workerResult: AgentResult;
  /** Accumulated output text from the Worker */
  output: string;
  /** Round number (1-based) */
  round: number;
}

/** Result from the Antithesis (critic) phase */
export interface AntithesisResult {
  /** The raw Worker result */
  workerResult: AgentResult;
  /** Structured critique text */
  critique: string;
  /** Extracted quality assessment */
  quality: QualityScore;
  /** Round number */
  round: number;
}

/** Result from the Synthesis (arbiter) phase */
export interface SynthesisResult {
  /** The raw Worker result */
  workerResult: AgentResult;
  /** Final integrated output */
  output: string;
  /** Final quality assessment */
  quality: QualityScore;
  /** Round number */
  round: number;
  /** Whether this is the final accepted output */
  accepted: boolean;
}

/** Complete round record */
export interface RoundRecord {
  round: number;
  thesis: ThesisResult;
  antithesis: AntithesisResult;
  synthesis: SynthesisResult;
  /** Total duration for this round (ms) */
  duration: number;
}

// ============================================
// Harness Configuration
// ============================================

/** Adversarial harness configuration */
export interface AdversarialConfig {
  /** Maximum refinement rounds (default: 3) */
  maxRounds?: number;
  /** Quality threshold to pass (0.0 – 1.0, default: 0.7) */
  qualityThreshold?: number;
  /** Model override for critic and arbiter agents */
  modelId?: string;
  /** Whether to stream intermediate events (default: true) */
  streaming?: boolean;
}

/** Resolved config with defaults applied */
export interface ResolvedAdversarialConfig {
  maxRounds: number;
  qualityThreshold: number;
  modelId?: string;
  streaming: boolean;
}

// ============================================
// Harness Result
// ============================================

/** Complete harness execution result */
export interface HarnessResult {
  /** Final integrated output */
  text: string;
  /** Whether quality threshold was met */
  success: boolean;
  /** All round records for audit trail */
  rounds: RoundRecord[];
  /** Total duration (ms) */
  duration: number;
  /** Final quality assessment */
  quality: QualityScore;
  /** Total rounds executed */
  totalRounds: number;
  /** Error if harness itself failed */
  error?: string;
}

// ============================================
// Harness Callbacks
// ============================================

/** Callbacks for harness phase transitions */
export interface HarnessCallbacks {
  /** Called when a round starts */
  onRoundStart?: (round: number) => void;
  /** Called when Thesis completes */
  onThesisComplete?: (result: ThesisResult) => void;
  /** Called when Antithesis completes */
  onAntithesisComplete?: (result: AntithesisResult) => void;
  /** Called when Synthesis completes */
  onSynthesisComplete?: (result: SynthesisResult) => void;
  /** Called when a round completes */
  onRoundComplete?: (record: RoundRecord) => void;
  /** Called when harness completes */
  onComplete?: (result: HarnessResult) => void;
}

// ============================================
// Quality Gate Weights
// ============================================

/** Default quality dimension weights */
export const DEFAULT_QUALITY_WEIGHTS: Record<QualityDimension, number> = {
  correctness: 0.35,
  completeness: 0.30,
  actionability: 0.20,
  security: 0.15,
};

/** Quality dimension descriptions for prompts */
export const QUALITY_DIMENSION_DESCRIPTIONS: Record<QualityDimension, string> = {
  correctness: 'Factual accuracy and logical soundness of the output',
  completeness: 'All requested aspects covered, no missing pieces',
  actionability: 'Output is concrete and ready to use/execute without further clarification',
  security: 'No security vulnerabilities, safe patterns, proper input handling',
};
