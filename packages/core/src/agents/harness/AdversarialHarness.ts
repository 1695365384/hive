/**
 * AdversarialHarness — Triadic adversarial quality assurance engine.
 *
 * Implements the Hegelian dialectic pattern:
 *   Thesis (executor) → Antithesis (critic) → Synthesis (arbiter)
 *
 * Quality-gated iterative refinement loop:
 *   1. Critic reviews current output, finds flaws
 *   2. Arbiter integrates critique into improved output
 *   3. If quality ≥ threshold → return. Otherwise → repeat.
 *
 * Usage (from CoordinatorCapability):
 *   const harness = new AdversarialHarness(context.providerManager);
 *   const result = await harness.run(task, thesisOutput, config, callbacks);
 */

import type { ProviderManager } from '../../providers/ProviderManager.js';
import { createAgentRunner, AgentRunner } from '../core/runner.js';
import { getPromptTemplate } from '../prompts/PromptTemplate.js';
import { parseCriticQuality, parseArbiterOutput, passesQualityGate, createFallbackQuality } from './quality-gate.js';
import type {
  AdversarialConfig,
  ResolvedAdversarialConfig,
  HarnessResult,
  HarnessCallbacks,
  RoundRecord,
  ThesisResult,
  AntithesisResult,
  SynthesisResult,
  QualityScore,
} from './types.js';

// ============================================
// Default Configuration
// ============================================

const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_QUALITY_THRESHOLD = 0.7;

function resolveConfig(config: AdversarialConfig): ResolvedAdversarialConfig {
  return {
    maxRounds: config.maxRounds ?? DEFAULT_MAX_ROUNDS,
    qualityThreshold: config.qualityThreshold ?? DEFAULT_QUALITY_THRESHOLD,
    modelId: config.modelId,
    streaming: config.streaming ?? true,
  };
}

// ============================================
// Prompt Building
// ============================================

/** Maximum output length to pass to critic/arbiter (prevents context explosion) */
const MAX_OUTPUT_LENGTH = 16000;

function truncateOutput(output: string, maxLength: number = MAX_OUTPUT_LENGTH): string {
  if (output.length <= maxLength) return output;
  const headLen = Math.floor(maxLength * 0.6);
  const tailLen = maxLength - headLen - 100;
  return output.slice(0, headLen) + '\n\n[... output truncated for length ...]\n\n' + output.slice(-tailLen);
}

function buildCriticPrompt(task: string, thesisOutput: string): string {
  const template = getPromptTemplate();
  try {
    return template.render('critic', {
      task,
      thesis_output: truncateOutput(thesisOutput),
    });
  } catch {
    // Template not found — build inline fallback
    return buildCriticPromptFallback(task, truncateOutput(thesisOutput));
  }
}

function buildArbiterPrompt(task: string, thesisOutput: string, critique: string): string {
  const template = getPromptTemplate();
  try {
    return template.render('arbiter', {
      task,
      thesis_output: truncateOutput(thesisOutput),
      critique,
    });
  } catch {
    return buildArbiterPromptFallback(task, truncateOutput(thesisOutput), critique);
  }
}

/** Inline fallback if template file is missing (ensures harness always works) */
function buildCriticPromptFallback(task: string, thesisOutput: string): string {
  return [
    'You are a Critic Agent — an adversarial reviewer in a quality assurance pipeline.',
    '',
    'Examine the thesis output against four quality dimensions: correctness, completeness, actionability, security.',
    'For each dimension, provide a score (0.0-1.0), issues, and suggestions.',
    '',
    'Respond in JSON only:',
    '{',
    '  "overall_score": 0.0,',
    '  "passed": false,',
    '  "dimensions": [',
    '    {"dimension": "correctness", "score": 0.0, "issues": [...], "suggestions": [...]},',
    '    {"dimension": "completeness", "score": 0.0, "issues": [...], "suggestions": [...]},',
    '    {"dimension": "actionability", "score": 0.0, "issues": [...], "suggestions": [...]},',
    '    {"dimension": "security", "score": 0.0, "issues": [...], "suggestions": [...]}',
    '  ],',
    '  "critical_flaws": [...],',
    '  "summary": "..."',
    '}',
    '',
    '## Original User Task',
    task,
    '',
    '## Thesis Output (to review)',
    thesisOutput,
  ].join('\n');
}

function buildArbiterPromptFallback(task: string, thesisOutput: string, critique: string): string {
  return [
    'You are an Arbiter Agent — the neutral Synthesis in a quality pipeline.',
    'You receive the thesis output and the critic review, and produce the final integrated output.',
    '',
    'Respond in JSON only:',
    '{',
    '  "decision": "ACCEPT" | "REVISE" | "REJECT",',
    '  "overall_score": 0.0,',
    '  "final_output": "...",',
    '  "changes_made": [...],',
    '  "quality_assessment": {',
    '    "overall": 0.0,',
    '    "dimensions": [',
    '      {"dimension": "...", "score": 0.0, "rationale": "..."}',
    '    ],',
    '    "passed": false,',
    '    "summary": "..."',
    '  },',
    '  "revision_round_needed": false',
    '}',
    '',
    '## Original User Task',
    task,
    '',
    '## Thesis Output',
    thesisOutput,
    '',
    '## Critic Review',
    critique,
  ].join('\n');
}

// ============================================
// Harness Engine
// ============================================

export class AdversarialHarness {
  private runner: AgentRunner;

  constructor(providerManager: ProviderManager) {
    this.runner = createAgentRunner(providerManager);
  }

  /**
   * Run the adversarial harness loop on a thesis output.
   *
   * @param task        The original user task
   * @param thesisOutput The output from the thesis (general) worker's first execution
   * @param config      Harness configuration
   * @param callbacks   Optional phase callbacks
   * @returns HarnessResult with final output and quality assessment
   */
  async run(
    task: string,
    thesisOutput: string,
    config: AdversarialConfig = {},
    callbacks?: HarnessCallbacks,
  ): Promise<HarnessResult> {
    const resolved = resolveConfig(config);
    const startTime = Date.now();
    const rounds: RoundRecord[] = [];

    let currentOutput = thesisOutput;
    let finalQuality: QualityScore = createFallbackQuality(thesisOutput);
    let success = false;

    for (let round = 1; round <= resolved.maxRounds; round++) {
      callbacks?.onRoundStart?.(round);
      const roundStart = Date.now();

      // —— Thesis (current best output) ——
      // In round 1, this is the original worker output.
      // In subsequent rounds, it's the arbiter's synthesis from the previous round.
      const thesisResult: ThesisResult = {
        workerResult: { text: currentOutput, tools: [], success: true },
        output: currentOutput,
        round,
      };
      callbacks?.onThesisComplete?.(thesisResult);

      // —— Antithesis (critic review) ——
      const antithesisResult = await this.runCritic(task, currentOutput, round, resolved);
      callbacks?.onAntithesisComplete?.(antithesisResult);

      // —— Synthesis (arbiter integration) ——
      const synthesisResult = await this.runArbiter(
        task,
        currentOutput,
        antithesisResult.critique,
        round,
        resolved,
      );
      callbacks?.onSynthesisComplete?.(synthesisResult);

      // Record round
      const roundRecord: RoundRecord = {
        round,
        thesis: thesisResult,
        antithesis: antithesisResult,
        synthesis: synthesisResult,
        duration: Date.now() - roundStart,
      };
      rounds.push(roundRecord);
      callbacks?.onRoundComplete?.(roundRecord);

      // Quality gate check
      finalQuality = synthesisResult.quality;
      if (synthesisResult.accepted || passesQualityGate(finalQuality, resolved)) {
        success = true;
        break;
      }

      // Prepare for next round: arbiter output becomes new thesis
      if (synthesisResult.output) {
        currentOutput = synthesisResult.output;
      }

      // If arbiter says no revision needed despite failed quality, stop
      if (!synthesisResult.accepted && !passesQualityGate(finalQuality, resolved)) {
        // Continue to next round
      }
    }

    const result: HarnessResult = {
      text: rounds.length > 0 ? rounds[rounds.length - 1].synthesis.output : thesisOutput,
      success,
      rounds,
      duration: Date.now() - startTime,
      quality: finalQuality,
      totalRounds: rounds.length,
    };

    callbacks?.onComplete?.(result);
    return result;
  }

  /**
   * Run the Critic (Antithesis) agent.
   */
  private async runCritic(
    task: string,
    thesisOutput: string,
    round: number,
    config: ResolvedAdversarialConfig,
  ): Promise<AntithesisResult> {
    const systemPrompt = buildCriticPrompt(task, thesisOutput);
    const prompt = `Review the thesis output above for round ${round}. Provide your critique in the specified JSON format.`;

    const result = await this.runner.execute('critic', prompt, {
      systemPrompt,
      model: config.modelId,
    });

    const quality = parseCriticQuality(result.text) ?? createFallbackQuality(thesisOutput, result.error);

    return {
      workerResult: result,
      critique: result.text,
      quality,
      round,
    };
  }

  /**
   * Run the Arbiter (Synthesis) agent.
   */
  private async runArbiter(
    task: string,
    thesisOutput: string,
    critique: string,
    round: number,
    config: ResolvedAdversarialConfig,
  ): Promise<SynthesisResult> {
    const systemPrompt = buildArbiterPrompt(task, thesisOutput, critique);
    const prompt = `Synthesize the final output for round ${round}. Respond in the specified JSON format.`;

    const result = await this.runner.execute('arbiter', prompt, {
      systemPrompt,
      model: config.modelId,
    });

    const parsed = parseArbiterOutput(result.text);
    let quality: QualityScore;
    let output: string;
    let accepted: boolean;

    if (parsed) {
      quality = parsed.quality;
      output = parsed.finalOutput;
      accepted = parsed.decision === 'ACCEPT' && !parsed.revisionNeeded;
    } else {
      // Fallback: use raw output as final, mark as low quality
      output = result.text || thesisOutput;
      quality = createFallbackQuality(output, 'Failed to parse arbiter JSON output');
      accepted = false;
    }

    return {
      workerResult: result,
      output,
      quality,
      round,
      accepted,
    };
  }
}

/**
 * Create an AdversarialHarness instance.
 */
export function createAdversarialHarness(providerManager: ProviderManager): AdversarialHarness {
  return new AdversarialHarness(providerManager);
}
