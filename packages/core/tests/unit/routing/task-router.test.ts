import { describe, it, expect } from 'vitest';
import {
  createDefaultTaskRouter,
  OFFICE_SCENARIO_ID,
  SCHEDULE_SCENARIO_ID,
  primaryDelegateSpawn,
  validateWorkerSpawn,
} from '../../../src/routing/index.js';

describe('TaskRouter', () => {
  const router = createDefaultTaskRouter();

  it('resolves office inquiry without delegate', () => {
    const decision = router.resolve('你能做PPT吗');
    expect(decision.action).toBe('inquiry');
    if (decision.action === 'inquiry') {
      expect(decision.scenarioId).toBe(OFFICE_SCENARIO_ID);
      expect(decision.reply).toContain('officecli');
    }
  });

  it('resolves office creation as delegate', () => {
    const decision = router.resolve('帮我做一个关于 AI 的 PPT');
    expect(decision.action).toBe('delegate');
    if (decision.action === 'delegate') {
      expect(decision.spawns).toHaveLength(1);
      expect(decision.spawns[0]!.type).toBe('office');
      expect(decision.spawns[0]!.scenarioId).toBe(OFFICE_SCENARIO_ID);
    }
  });

  it('resolves research-heavy office creation as explore+office collaborate', () => {
    const decision = router.resolve('帮我调研竞品并做一个 8 页 PPT');
    expect(decision.action).toBe('delegate');
    if (decision.action === 'delegate') {
      expect(decision.spawns.map((s) => s.type).sort()).toEqual(['explore', 'office']);
      expect(decision.spawns.every((s) => s.scenarioId === OFFICE_SCENARIO_ID)).toBe(true);
      expect(primaryDelegateSpawn(decision.spawns).type).toBe('office');
    }
  });

  it('primaryDelegateSpawn rejects empty list', () => {
    expect(() => primaryDelegateSpawn([])).toThrow(/must not be empty/);
  });

  it('returns hint for ambiguous office task', () => {
    const decision = router.resolve('做一个 quarterly report pptx');
    expect(decision.action).toBe('delegate');
  });

  it('resolves schedule creation as delegate', () => {
    const decision = router.resolve('帮我每天上午9点提醒我开会');
    expect(decision.action).toBe('delegate');
    if (decision.action === 'delegate') {
      expect(decision.spawns).toHaveLength(1);
      expect(decision.spawns[0]!.type).toBe('schedule');
      expect(decision.scenarioId).toBe(SCHEDULE_SCENARIO_ID);
    }
  });

  it('returns pass for unrelated tasks', () => {
    expect(router.resolve('hello world').action).toBe('pass');
  });

  it('getRoutingHint returns directive for office hint path', () => {
    // Office task that is neither inquiry nor strong creation goes to hint
    // Use a task that matches office but resolves to hint - e.g. "ppt about AI" without creation verbs
    const hint = router.getRoutingHint('我需要 ppt 模板建议');
    expect(hint).toContain('type="office"');
  });

  it('validateSpawn rejects wrong worker for office task', () => {
    const error = validateWorkerSpawn('做一个 PPT', {
      type: 'general',
      prompt: 'test',
    });
    expect(error).toContain('Status: FAILED');
    expect(error).toContain('office');
  });

  it('validateSpawn allows explore worker for office research assist', () => {
    const error = validateWorkerSpawn('调研竞品做 PPT', {
      type: 'explore',
      prompt: 'research',
      scenarioId: OFFICE_SCENARIO_ID,
    });
    expect(error).toBeNull();
  });

  it('validateSpawn allows office worker for office task', () => {
    const error = validateWorkerSpawn('做一个 PPT', {
      type: 'office',
      prompt: 'test',
      scenarioId: OFFICE_SCENARIO_ID,
    });
    expect(error).toBeNull();
  });

  it('validateSpawn rejects general worker for schedule task', () => {
    const error = validateWorkerSpawn('create a daily cron job', {
      type: 'general',
      prompt: 'test',
    });
    expect(error).toContain('schedule');
  });
});

describe('ScenarioRegistry', () => {
  it('registers scenarios by priority', () => {
    const registry = createDefaultTaskRouter().getRegistry();
    const ids = registry.list().map(s => s.id);
    expect(ids).toContain(OFFICE_SCENARIO_ID);
    expect(ids).toContain(SCHEDULE_SCENARIO_ID);
  });
});
