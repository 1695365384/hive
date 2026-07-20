/**
 * Todo / Goal enforcer — decide when to inject a same-Goal continuation.
 *
 * Idle + incomplete Goal → inject continuation prompt (via chat.continue / Server).
 * Does not invent a new user task; always refers to GoalStore.goal.
 */

import type { GoalRecord } from './GoalStore.js';

/** Max user/idle Continues against the same Goal */
export const MAX_GOAL_CONTINUES = 3;

export type EnforceDecision =
  | { action: 'inject'; prompt: string }
  | { action: 'busy' }
  | { action: 'exhausted' }
  | { action: 'noop' };

export function isIncompleteGoal(goal: GoalRecord | undefined | null): boolean {
  if (!goal) return false;
  if (goal.status === 'done' || goal.status === 'cancelled') return false;
  const openTodos = goal.todos.filter((t) => !t.done);
  if (goal.todos.length > 0 && openTodos.length > 0) return true;
  return goal.status === 'active' || goal.status === 'blocked';
}

export function buildGoalContinuationPrompt(goal: GoalRecord): string {
  const reasonBlock =
    goal.reasons.length > 0
      ? goal.reasons.map((r, i) => `${i + 1}. ${r}`).join('\n')
      : '1. Previous attempt did not finish the Goal';

  const todoBlock =
    goal.todos.length > 0
      ? goal.todos
          .map((t) => `- [${t.done ? 'x' : ' '}] ${t.text}`)
          .join('\n')
      : '';

  return [
    'Continue the SAME Goal until it is actually complete.',
    'Do not apologize. Do not start a different task. Prefer tools/workers over promises.',
    '',
    `Original Goal:\n${goal.goal}`,
    '',
    `Outstanding failures / blockers:\n${reasonBlock}`,
    todoBlock ? `\nTodos:\n${todoBlock}` : '',
    '',
    'Continue now.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Resolve whether to inject a continuation while the session is idle
 * (no in-flight dispatch) with an incomplete Goal.
 */
export function resolveIdleContinuation(
  goal: GoalRecord | undefined | null,
  opts: { inFlight: boolean },
): EnforceDecision {
  if (!isIncompleteGoal(goal) || !goal) return { action: 'noop' };
  if (opts.inFlight) return { action: 'busy' };
  if (goal.continueAttempts >= MAX_GOAL_CONTINUES) return { action: 'exhausted' };
  return { action: 'inject', prompt: buildGoalContinuationPrompt(goal) };
}
