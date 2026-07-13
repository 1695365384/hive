export {
  OFFICE_SCENARIO_ID,
  OFFICE_SCENARIO_LABELS,
  matchesOfficeScenario,
  resolveOfficeScenarioAction,
  buildOfficeWorkerSpawn,
  type OfficeScenarioAction,
} from '../routing/scenarios/office.scenario.js';

export {
  SCHEDULE_SCENARIO_ID,
  SCHEDULE_SCENARIO_LABELS,
  buildScheduleWorkerSpawn,
} from '../routing/scenarios/schedule.scenario.js';

export {
  ScenarioRegistry,
  TaskRouter,
  createDefaultScenarioRegistry,
  createDefaultTaskRouter,
  defaultTaskRouter,
  getScenarioLabel,
  validateWorkerSpawn,
  officeScenario,
  scheduleScenario,
} from '../routing/index.js';

export type {
  WorkerSpawnInput,
  ScenarioDefinition,
  RouterDecision,
  ScenarioLabels,
} from '../routing/index.js';
