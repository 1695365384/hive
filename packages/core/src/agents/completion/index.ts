export type {
  TaskTrace,
  TraceToolCall,
  TraceWorkerSpawn,
  VerifyResult,
  CompletionVerifyResult,
  CompletionVerifier,
  CompletionVerifierOptions,
  TaskProgressPhase,
  TaskProgressAction,
  TaskProgressEvent,
} from './types.js';

export {
  TaskTraceCollector,
  createEmptyTaskTrace,
  getAgentWorkerTypes,
  getSpawnedWorkerTypes,
} from './TaskTrace.js';

export {
  CompletionVerifierService,
  createCompletionVerifierService,
} from './CompletionVerifier.js';

export { officeCompletionVerifier } from './verifiers/office.js';
export { scheduleCompletionVerifier } from './verifiers/schedule.js';
export { genericCompletionVerifier } from './verifiers/generic.js';
export {
  isOfficeTask,
  isScheduleTask,
  isScheduleCreationTask,
  isScheduleInquiryTask,
  getTaskRoutingDirective,
  buildOfficeRoutingDirective,
  buildScheduleRoutingDirective,
} from './task-routing.js';

export {
  MAX_AUDIT_CONTINUES,
  collectFailureReasons,
  isRetryableFailure,
  buildContinuationPrompt,
  blockedActions,
  mapWorkflowPhaseToTaskProgress,
} from './discipline.js';

export {
  GoalStore,
  createGoalStore,
  type GoalStatus,
  type GoalTodo,
  type GoalRecord,
  type GoalPersistence,
  type GoalStoreOptions,
} from './GoalStore.js';

export {
  MAX_GOAL_CONTINUES,
  isIncompleteGoal,
  buildGoalContinuationPrompt,
  resolveIdleContinuation,
  type EnforceDecision,
} from './TodoEnforcer.js';
