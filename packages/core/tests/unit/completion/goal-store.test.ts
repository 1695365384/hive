/**
 * GoalStore + TodoEnforcer unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GoalStore } from '../../../src/agents/completion/GoalStore.js';
import {
  MAX_GOAL_CONTINUES,
  isIncompleteGoal,
  buildGoalContinuationPrompt,
  resolveIdleContinuation,
} from '../../../src/agents/completion/TodoEnforcer.js';

describe('GoalStore', () => {
  let store: GoalStore;

  beforeEach(() => {
    store = new GoalStore();
  });

  it('starts an active Goal', () => {
    const g = store.start('s1', '实现登录页');
    expect(g.goal).toBe('实现登录页');
    expect(g.status).toBe('active');
    expect(store.get('s1')?.goal).toBe('实现登录页');
  });

  it('ensure keeps original Goal text on continue', () => {
    store.start('s1', '实现登录页');
    store.markBlocked('s1', ['缺少交付']);
    const g = store.ensure('s1', 'Continue the SAME Goal...');
    expect(g.goal).toBe('实现登录页');
    expect(g.status).toBe('active');
  });

  it('tracks blocked / done / cancelled', () => {
    store.start('s1', '修 bug');
    store.markBlocked('s1', ['empty']);
    expect(store.get('s1')?.status).toBe('blocked');
    store.markDone('s1');
    expect(store.get('s1')?.status).toBe('done');
    store.start('s2', 'x');
    store.markCancelled('s2');
    expect(store.get('s2')?.status).toBe('cancelled');
  });

  it('updates from task-progress events', () => {
    store.start('s1', 'task');
    store.updateFromProgress('s1', {
      phase: 'continue',
      attempt: 1,
      maxAttempts: 2,
    });
    expect(store.get('s1')?.auditAttempts).toBe(1);
    store.updateFromProgress('s1', {
      phase: 'blocked',
      reasons: ['no tools'],
      attempt: 2,
    });
    expect(store.get('s1')?.status).toBe('blocked');
    expect(store.get('s1')?.reasons).toEqual(['no tools']);
    store.updateFromProgress('s1', { phase: 'done' });
    expect(store.get('s1')?.status).toBe('done');
  });

  it('bumps continue attempts', () => {
    store.start('s1', 'task');
    store.bumpContinueAttempts('s1');
    store.bumpContinueAttempts('s1');
    expect(store.get('s1')?.continueAttempts).toBe(2);
  });
});

describe('TodoEnforcer', () => {
  it('detects incomplete goals', () => {
    expect(isIncompleteGoal(undefined)).toBe(false);
    expect(
      isIncompleteGoal({
        sessionId: 's',
        goal: 'g',
        status: 'blocked',
        todos: [],
        reasons: [],
        auditAttempts: 0,
        continueAttempts: 0,
        createdAt: 0,
        updatedAt: 0,
      }),
    ).toBe(true);
    expect(
      isIncompleteGoal({
        sessionId: 's',
        goal: 'g',
        status: 'done',
        todos: [],
        reasons: [],
        auditAttempts: 0,
        continueAttempts: 0,
        createdAt: 0,
        updatedAt: 0,
      }),
    ).toBe(false);
  });

  it('treats open todos as incomplete even if status active', () => {
    expect(
      isIncompleteGoal({
        sessionId: 's',
        goal: 'g',
        status: 'active',
        todos: [{ id: '1', text: 'write file', done: false }],
        reasons: [],
        auditAttempts: 0,
        continueAttempts: 0,
        createdAt: 0,
        updatedAt: 0,
      }),
    ).toBe(true);
  });

  it('builds continuation prompt from Goal', () => {
    const prompt = buildGoalContinuationPrompt({
      sessionId: 's',
      goal: '实现登录页',
      status: 'blocked',
      todos: [{ id: '1', text: '写组件', done: false }],
      reasons: ['promise only'],
      auditAttempts: 2,
      continueAttempts: 0,
      createdAt: 0,
      updatedAt: 0,
    });
    expect(prompt).toContain('实现登录页');
    expect(prompt).toContain('promise only');
    expect(prompt).toContain('写组件');
    expect(prompt).toContain('Continue now');
  });

  it('injects only when idle + incomplete', () => {
    const goal = {
      sessionId: 's',
      goal: 'task',
      status: 'blocked' as const,
      todos: [],
      reasons: ['x'],
      auditAttempts: 2,
      continueAttempts: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    expect(resolveIdleContinuation(goal, { inFlight: true }).action).toBe('busy');
    expect(resolveIdleContinuation(goal, { inFlight: false }).action).toBe('inject');
    goal.continueAttempts = MAX_GOAL_CONTINUES;
    expect(resolveIdleContinuation(goal, { inFlight: false }).action).toBe('exhausted');
    goal.status = 'done';
    goal.continueAttempts = 0;
    expect(resolveIdleContinuation(goal, { inFlight: false }).action).toBe('noop');
  });
});

  // Regression: ISSUE-001 — cancel completion marked Goal done and broke continueGoal
  // Found by /qa on 2026-07-20
  // Report: .gstack/qa-reports/qa-report-localhost-1420-2026-07-20.md
  it('keeps blocked Goal injectable after cancel (must not markDone)', () => {
    const store = new GoalStore();
    store.start('ws-chat:t-cancel', '写一份竞品调研');
    store.markBlocked('ws-chat:t-cancel', ['已中断，可继续完成']);
    const decision = resolveIdleContinuation(store.get('ws-chat:t-cancel'), { inFlight: false });
    expect(decision.action).toBe('inject');
    // Bug reproduction: markDone after abort made continueGoal noop
    store.markDone('ws-chat:t-cancel');
    expect(resolveIdleContinuation(store.get('ws-chat:t-cancel'), { inFlight: false }).action).toBe('noop');
  });

  it('treats done-with-failure-label as blocked, not done', () => {
    const store = new GoalStore();
    store.start('ws-chat:t-fail-done', '写 PPT');
    store.updateFromProgress('ws-chat:t-fail-done', {
      phase: 'done',
      message: '任务失败',
    });
    expect(store.get('ws-chat:t-fail-done')?.status).toBe('blocked');
    expect(resolveIdleContinuation(store.get('ws-chat:t-fail-done'), { inFlight: false }).action).toBe('inject');
  });
