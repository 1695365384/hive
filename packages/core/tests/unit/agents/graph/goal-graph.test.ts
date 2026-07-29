/**
 * GoalGraph unit tests — AttemptPlan match + Goal lifecycle.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGoalGraph,
  planAttempt,
  needsPptDelivery,
} from '../../../../src/agents/graph/index.js';
import { createGoalStore } from '../../../../src/agents/completion/GoalStore.js';
import { isIncompleteGoal } from '../../../../src/agents/completion/TodoEnforcer.js';

describe('planAttempt / needsPptDelivery', () => {
  it('flags PPT tasks for send-file delivery', () => {
    expect(needsPptDelivery('做一个项目汇报 PPT')).toBe(true);
    expect(needsPptDelivery('写周报')).toBe(false);
    const plan = planAttempt('请做一份 mid-year review presentation');
    expect(plan.requiredDeliveryTool).toBe('send-file');
    expect(plan.scenarioId).toBe('office-document');
    expect(plan.blurbs.length).toBeGreaterThan(0);
  });

  it('matches schedule scenario without ppt delivery', () => {
    const plan = planAttempt('每天早上 9 点提醒我喝水');
    expect(plan.scenarioId).toBe('recurring-task');
    expect(plan.requiredDeliveryTool).toBeUndefined();
  });

  it('passes through conversational tasks', () => {
    const plan = planAttempt('你好');
    expect(plan.scenarioId).toBeUndefined();
    expect(plan.requiredDeliveryTool).toBeUndefined();
  });
});

describe('GoalGraph lifecycle', () => {
  let graph: ReturnType<typeof createGoalGraph>;

  beforeEach(() => {
    graph = createGoalGraph({ store: createGoalStore() });
  });

  it('starts a fresh Goal on user turn', () => {
    const g = graph.onUserTurn('s1', '做一个 PPT');
    expect(g.goal).toBe('做一个 PPT');
    expect(g.status).toBe('active');
  });

  it('continue keeps the same Goal text', () => {
    graph.onUserTurn('s1', '做一个 PPT');
    graph.onTurnComplete('s1', {
      verification: { passed: false, results: [{ passed: false, message: '缺 send-file' }] },
    });
    expect(graph.get('s1')?.status).toBe('blocked');

    const cont = graph.beginContinue('s1', { inFlight: false });
    expect(cont.ok).toBe(true);
    if (!cont.ok) return;
    graph.onUserTurn('s1', cont.prompt, { continueGoal: true });
    expect(graph.get('s1')?.goal).toBe('做一个 PPT');
    expect(graph.get('s1')?.status).toBe('active');
  });

  it('cancel does not leave an incomplete Goal', () => {
    graph.onUserTurn('s1', 'task');
    graph.cancel('s1');
    expect(graph.get('s1')).toBeUndefined();
  });

  it('aborted turn stays blocked / resumable', () => {
    graph.onUserTurn('s1', 'task');
    graph.onTurnComplete('s1', { cancelled: true, success: false });
    expect(isIncompleteGoal(graph.get('s1'))).toBe(true);
    expect(graph.get('s1')?.status).toBe('blocked');
  });

  it('verify fail → blocked; verify pass → done', () => {
    graph.onUserTurn('s1', 'task');
    graph.onTurnComplete('s1', {
      verification: { passed: false, results: [{ passed: false, message: 'x' }] },
    });
    expect(graph.get('s1')?.status).toBe('blocked');

    graph.onUserTurn('s2', 'task');
    graph.onTurnComplete('s2', { verification: { passed: true } });
    expect(graph.get('s2')?.status).toBe('done');
  });

  it('onProgress aborted done → blocked', () => {
    graph.onUserTurn('s1', 'task');
    graph.onProgress('s1', { phase: 'done' }, { aborted: true });
    expect(graph.get('s1')?.status).toBe('blocked');
  });

  it('beginContinue rejects when in flight', () => {
    graph.onUserTurn('s1', 'task');
    const r = graph.beginContinue('s1', { inFlight: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/running/i);
  });

  it('Continue planForTurn keeps office scenario + send-file sticky', () => {
    const pptGoal = '帮我做一个项目汇报 PPT';
    graph.onUserTurn('s1', pptGoal);
    const first = graph.planForTurn('s1', pptGoal);
    expect(first.scenarioId).toBe('office-document');
    expect(first.requiredDeliveryTool).toBe('send-file');
    expect(graph.get('s1')?.lastAttempt?.requiredDeliveryTool).toBe('send-file');

    graph.onAbort('s1');
    expect(graph.get('s1')?.status).toBe('blocked');

    const cont = graph.beginContinue('s1', { inFlight: false });
    expect(cont.ok).toBe(true);
    if (!cont.ok) return;

    graph.onUserTurn('s1', cont.prompt, { continueGoal: true });
    const resumed = graph.planForTurn('s1', cont.prompt, { continueGoal: true });
    expect(resumed.scenarioId).toBe('office-document');
    expect(resumed.requiredDeliveryTool).toBe('send-file');
    expect(resumed.blurbs.join('\n')).toMatch(/task/);
  });

  it('forced scenarioId locks office without NLP-friendly wording', () => {
    graph.onUserTurn('s1', '季度复盘三页');
    const plan = graph.planForTurn('s1', '季度复盘三页', {
      scenarioId: 'office-document',
    });
    expect(plan.scenarioId).toBe('office-document');
    expect(plan.blurbs.join('\n')).toMatch(/task|office/i);
  });

  it('unknown forced scenarioId throws UnknownScenarioError', () => {
    expect(() =>
      graph.planForTurn('s1', 'hi', { scenarioId: 'no-such-scene' }),
    ).toThrow(/Unknown scenario/);
  });
});
