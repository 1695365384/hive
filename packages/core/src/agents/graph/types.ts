/**
 * GoalGraph types — Graph-layer AttemptPlan (policy, not a workflow engine).
 */

export type AttemptPlan = {
  /** Original user task */
  task: string;
  /** Best-matching scenario id, if any */
  scenarioId?: string;
  /** Coordinator blurbs to inject into the system prompt */
  blurbs: string[];
  /** Hard delivery gate for the Loop (e.g. PPT must call send-file) */
  requiredDeliveryTool?: 'send-file';
};

export type TurnVerification = {
  passed: boolean;
  results?: Array<{ passed?: boolean; message: string }>;
};

export type TurnOutcome = {
  cancelled?: boolean;
  success?: boolean;
  verification?: TurnVerification;
};

export type ContinueGoalResult =
  | { ok: true; prompt: string; attempts: number; maxAttempts: number }
  | { ok: false; error: string };
