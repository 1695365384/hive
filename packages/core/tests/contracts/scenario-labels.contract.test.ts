import { describe, it, expect } from 'vitest';
import {
  getAllScenarioLabels,
  OFFICE_SCENARIO_ID,
  SCHEDULE_SCENARIO_ID,
  OFFICE_SCENARIO_LABELS,
  SCHEDULE_SCENARIO_LABELS,
} from '../../src/routing/index.js';

/**
 * Desktop worker-labels 应对齐此契约（见 apps/desktop worker-labels.test.ts）
 */
export const SCENARIO_LABEL_CONTRACT = {
  [OFFICE_SCENARIO_ID]: OFFICE_SCENARIO_LABELS.scenario,
  [SCHEDULE_SCENARIO_ID]: SCHEDULE_SCENARIO_LABELS.scenario,
} as const;

describe('Scenario label contract', () => {
  it('getAllScenarioLabels matches scenario definitions', () => {
    expect(getAllScenarioLabels()).toEqual(SCENARIO_LABEL_CONTRACT);
  });
});
