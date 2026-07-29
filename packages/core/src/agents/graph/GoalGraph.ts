/**
 * GoalGraph — Graph layer: how work units connect.
 *
 * Owns: match → AttemptPlan, Goal lifecycle, verify→Goal sync, Continue.
 * Does not own: LLM loop, tool execution, pi subagent scheduling, MCP, WS/HTTP.
 *
 * TaskRouter / ScenarioRegistry implement match; GoalStore is the persistence spine.
 */

import { defaultTaskRouter, type TaskRouter } from '../../routing/index.js';
import {
  createGoalStore,
  type GoalPersistence,
  type GoalRecord,
  type GoalStore,
} from '../completion/GoalStore.js';
import {
  isIncompleteGoal,
  MAX_GOAL_CONTINUES,
  resolveIdleContinuation,
} from '../completion/TodoEnforcer.js';
import type { TaskProgressEvent } from '../completion/types.js';
import type {
  AttemptPlan,
  ContinueGoalResult,
  TurnOutcome,
} from './types.js';

/** PPT / presentation deliverables require send-file (not Word/Excel alone). */
const PPT_DELIVERY_RE =
  /\b(?:ppt|pptx|powerpoint|presentation)\b|幻灯片|演示文稿|汇报材料/i;

export function needsPptDelivery(task: string): boolean {
  return PPT_DELIVERY_RE.test(task);
}

/**
 * Match task → AttemptPlan via TaskRouter (live Graph entry for routing).
 */
export function planAttempt(
  task: string,
  router: TaskRouter = defaultTaskRouter,
): AttemptPlan {
  const trimmed = task.trim();
  const decision = router.resolve(trimmed);
  const scenarioId =
    decision.action === 'pass' ? undefined : decision.scenarioId;
  const blurbs = router.getCoordinatorBlurbs(trimmed);
  const requiredDeliveryTool = needsPptDelivery(trimmed)
    ? 'send-file'
    : undefined;

  return {
    task: trimmed,
    scenarioId,
    blurbs,
    requiredDeliveryTool,
  };
}

export type GoalGraphOptions = {
  store?: GoalStore;
  router?: TaskRouter;
};

export class GoalGraph {
  private readonly store: GoalStore;
  private readonly router: TaskRouter;

  constructor(options?: GoalGraphOptions) {
    this.store = options?.store ?? createGoalStore();
    this.router = options?.router ?? defaultTaskRouter;
  }

  /** Expose store for SQLite attach/hydrate (Server bootstrap only). */
  getStore(): GoalStore {
    return this.store;
  }

  plan(task: string): AttemptPlan {
    return planAttempt(task, this.router);
  }

  /**
   * Match for this turn. On Continue, re-match the **original Goal text** so
   * scenario / send-file constraints stick even when the continue prompt is conversational.
   */
  planForTurn(
    sessionId: string,
    content: string,
    opts: { continueGoal?: boolean } = {},
  ): AttemptPlan {
    if (opts.continueGoal) {
      const record = this.store.get(sessionId);
      if (record?.goal) {
        const fromOriginal = planAttempt(record.goal, this.router);
        return {
          task: content.trim(),
          scenarioId: fromOriginal.scenarioId ?? record.lastAttempt?.scenarioId,
          blurbs: fromOriginal.blurbs,
          requiredDeliveryTool:
            fromOriginal.requiredDeliveryTool ?? record.lastAttempt?.requiredDeliveryTool,
        };
      }
    }

    const plan = planAttempt(content, this.router);
    this.store.setLastAttempt(sessionId, {
      scenarioId: plan.scenarioId,
      requiredDeliveryTool: plan.requiredDeliveryTool,
    });
    return plan;
  }

  get(sessionId: string): GoalRecord | undefined {
    return this.store.get(sessionId);
  }

  attachPersistence(persistence: GoalPersistence): void {
    this.store.attachPersistence(persistence);
  }

  hydrate(records: GoalRecord[]): void {
    this.store.hydrate(records);
  }

  /** Fresh user turn vs Continue that keeps the same Goal text. */
  onUserTurn(
    sessionId: string,
    content: string,
    opts: { continueGoal?: boolean } = {},
  ): GoalRecord {
    if (opts.continueGoal) {
      return this.store.ensure(sessionId, content);
    }
    return this.store.start(sessionId, content);
  }

  /**
   * Sync Goal from streaming progress.
   * When aborted, late "done" pulses become blocked (resumable).
   */
  onProgress(
    sessionId: string,
    progress: TaskProgressEvent,
    opts: { aborted?: boolean } = {},
  ): void {
    if (opts.aborted && progress.phase === 'done') {
      const reasons = progress.reasons?.length
        ? progress.reasons
        : ['已中断，可继续完成'];
      this.store.markBlocked(sessionId, reasons);
      return;
    }
    this.store.updateFromProgress(sessionId, progress);
  }

  /**
   * Apply final turn outcome when progress events were skipped or raced cancel.
   * Cancelled turns stay blocked/resumable — never markDone after abort.
   */
  onTurnComplete(sessionId: string, outcome: TurnOutcome): void {
    if (outcome.cancelled) {
      this.markInterrupted(sessionId);
      return;
    }

    const verification = outcome.verification;
    if (verification) {
      if (verification.passed) {
        this.store.markDone(sessionId);
        return;
      }
      if (isIncompleteGoal(this.store.get(sessionId))) {
        const reasons = (verification.results ?? [])
          .filter((r) => r && r.passed === false)
          .map((r) => r.message)
          .filter(Boolean);
        this.store.markBlocked(
          sessionId,
          reasons.length ? reasons : ['完成校验未通过'],
        );
      }
      return;
    }

    if (outcome.success) {
      this.store.markDone(sessionId);
    }
  }

  /** Abort mid-turn: keep Goal resumable via Continue. */
  onAbort(sessionId: string): void {
    this.markInterrupted(sessionId);
  }

  cancel(sessionId: string): { ok: boolean; hadGoal: boolean } {
    const goal = this.store.get(sessionId);
    if (!goal) {
      return { ok: true, hadGoal: false };
    }
    this.store.markCancelled(sessionId);
    this.store.clear(sessionId);
    return { ok: true, hadGoal: true };
  }

  /**
   * Prepare a same-Goal Continue. Caller (Server) still owns channel dispatch.
   */
  beginContinue(
    sessionId: string,
    opts: { inFlight: boolean },
  ): ContinueGoalResult {
    const goal = this.store.get(sessionId);
    const decision = resolveIdleContinuation(goal, {
      inFlight: opts.inFlight,
    });
    if (decision.action === 'noop') {
      return { ok: false, error: 'No incomplete Goal to continue' };
    }
    if (decision.action === 'busy') {
      return { ok: false, error: 'Goal is already running' };
    }
    if (decision.action === 'exhausted') {
      return { ok: false, error: 'Continue budget exhausted for this Goal' };
    }

    this.store.bumpContinueAttempts(sessionId);
    this.store.markActive(sessionId);
    const attempts = this.store.get(sessionId)?.continueAttempts ?? 1;
    return {
      ok: true,
      prompt: decision.prompt,
      attempts,
      maxAttempts: MAX_GOAL_CONTINUES,
    };
  }

  private markInterrupted(sessionId: string): void {
    if (!isIncompleteGoal(this.store.get(sessionId))) return;
    const existing = this.store.get(sessionId);
    const reasons = existing?.reasons?.length
      ? existing.reasons
      : ['已中断，可继续完成'];
    this.store.markBlocked(sessionId, reasons);
  }
}

export function createGoalGraph(options?: GoalGraphOptions): GoalGraph {
  return new GoalGraph(options);
}
