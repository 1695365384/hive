/**
 * Harness barrel export — pure quality-gate helpers only.
 * AdversarialHarness (LLMRuntime/AgentRunner-backed) removed with pi-only cutover.
 */
export {
  parseCriticQuality,
  parseArbiterOutput,
  passesQualityGate,
  createFallbackQuality,
} from './quality-gate.js';
export type {
  AdversarialConfig,
  ResolvedAdversarialConfig,
  QualityScore,
  QualityDimension,
  DimensionScore,
  HarnessResult,
  HarnessCallbacks,
  RoundRecord,
  ThesisResult,
} from './types.js';
