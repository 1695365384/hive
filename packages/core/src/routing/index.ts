export type {
  WorkerSpawnInput,
  ScenarioLabels,
  ScenarioResolveResult,
  ScenarioDefinition,
  RouterDecision,
} from './types.js';

export { primaryDelegateSpawn } from './types.js';

export { ScenarioRegistry } from './ScenarioRegistry.js';
export { TaskRouter } from './TaskRouter.js';
export {
  createDefaultScenarioRegistry,
  createDefaultTaskRouter,
  defaultTaskRouter,
  getScenarioLabel,
  getAllScenarioLabels,
  validateWorkerSpawn,
} from './default-registry.js';

export type { ScenarioCopy } from './types.js';
export { pickLocalizedLines } from './scenario-copy.js';

export {
  OFFICE_SCENARIO_ID,
  OFFICE_SCENARIO_LABELS,
  officeScenario,
  officeScenarioCopy,
  matchesOfficeScenario,
  resolveOfficeScenarioAction,
  buildOfficeWorkerSpawn,
  buildOfficeExploreAssistSpawn,
  withOfficeResearchNotes,
  needsOfficeResearchAssist,
  isOfficeTask,
  isOfficeInquiryTask,
  isOfficeCreationTask,
  getOfficeInquiryReply,
  buildOfficeRoutingDirective,
  type OfficeScenarioAction,
} from './scenarios/office.scenario.js';

export {
  SCHEDULE_SCENARIO_ID,
  SCHEDULE_SCENARIO_LABELS,
  scheduleScenario,
  scheduleScenarioCopy,
  buildScheduleWorkerSpawn,
  isScheduleTask,
  isScheduleInquiryTask,
  isScheduleCreationTask,
  getScheduleInquiryReply,
  buildScheduleRoutingDirective,
} from './scenarios/schedule.scenario.js';

export {
  NAMED_WORKER_SCENARIO_ID,
  NAMED_WORKER_SCENARIO_LABELS,
  namedWorkerScenario,
  namedWorkerScenarioCopy,
  detectNamedWorkerType,
  matchesNamedWorkerScenario,
  buildNamedWorkerSpawn,
} from './scenarios/named-worker.scenario.js';

export { hasNoArtifactIntent } from './intent.js';
