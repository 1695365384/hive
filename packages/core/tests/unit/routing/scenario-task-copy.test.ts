/**
 * Scenario blurbs must teach the live pi `task` tool, not legacy agent(type=).
 */

import { describe, it, expect } from 'vitest';
import { planAttempt } from '../../../src/agents/graph/index.js';
import { officeScenarioCopy } from '../../../src/routing/scenarios/office.scenario.js';
import { scheduleScenarioCopy } from '../../../src/routing/scenarios/schedule.scenario.js';
import { namedWorkerScenarioCopy } from '../../../src/routing/scenarios/named-worker.scenario.js';

describe('scenario copy uses task tool (Prompt layer)', () => {
  it('office blurb/hint prefer task agent office', () => {
    const blurb = officeScenarioCopy.coordinatorBlurb!('做一个 PPT');
    const hint = officeScenarioCopy.routingHint();
    expect(blurb).toMatch(/task/);
    expect(blurb).toMatch(/"office"/);
    expect(hint).toMatch(/task/);
    // Must not instruct agent(type= as the primary verb without task
    expect(blurb).not.toMatch(/spawn agent\(type=/);
    expect(hint).toMatch(/agent `"office"`|agent: "office"/);
  });

  it('schedule hint uses task agent schedule', () => {
    const hint = scheduleScenarioCopy.routingHint();
    expect(hint).toMatch(/task/);
    expect(hint).toMatch(/"schedule"/);
  });

  it('named-worker blurb uses task', () => {
    const blurb = namedWorkerScenarioCopy.coordinatorBlurb!('请用 librarian 查一下');
    expect(blurb).toMatch(/task/);
    expect(blurb).toMatch(/librarian/);
  });

  it('planAttempt PPT blurbs include task guidance', () => {
    const plan = planAttempt('帮我做一个项目汇报 PPT');
    expect(plan.scenarioId).toBe('office-document');
    expect(plan.blurbs.join('\n')).toMatch(/task/);
    expect(plan.requiredDeliveryTool).toBe('send-file');
  });
});
