/**
 * Harness barrel export
 */
export { AdversarialHarness, createAdversarialHarness } from './AdversarialHarness.js';
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
  AntithesisResult,
  SynthesisResult,
} from './types.js';
export {
  DEFAULT_QUALITY_WEIGHTS,
  QUALITY_DIMENSION_DESCRIPTIONS,
} from './types.js';
