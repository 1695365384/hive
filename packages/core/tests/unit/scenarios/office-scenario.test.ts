import { describe, it, expect } from 'vitest';
import {
  OFFICE_SCENARIO_ID,
  matchesOfficeScenario,
  resolveOfficeScenarioAction,
  buildOfficeWorkerSpawn,
} from '../../../src/scenarios/office-scenario.js';

describe('OfficeScenario', () => {
  it('matches office-related tasks', () => {
    expect(matchesOfficeScenario('帮我做一个 PPT')).toBe(true);
    expect(matchesOfficeScenario('hello')).toBe(false);
  });

  it('resolves inquiry without worker', () => {
    const action = resolveOfficeScenarioAction('你能做PPT吗');
    expect(action.kind).toBe('inquiry');
    if (action.kind === 'inquiry') {
      expect(action.reply).toContain('officecli');
    }
  });

  it('resolves skill inquiry (你有PPT技能吗)', () => {
    const action = resolveOfficeScenarioAction('你有PPT技能吗？');
    expect(action.kind).toBe('inquiry');
    if (action.kind === 'inquiry') {
      expect(action.reply).toContain('officecli');
      expect(action.reply).toContain('office Worker');
    }
  });

  it('resolves creation with worker description', () => {
    const action = resolveOfficeScenarioAction('帮我做一个关于 AI 的 PPT');
    expect(action.kind).toBe('creation');
    if (action.kind === 'creation') {
      expect(action.prompt).toContain('AI');
      expect(action.description).toContain('officecli');
    }
  });

  it('buildOfficeWorkerSpawn includes scenario id', () => {
    const spawn = buildOfficeWorkerSpawn('做一个 PPT');
    expect(spawn.type).toBe('office');
    expect(spawn.scenarioId).toBe(OFFICE_SCENARIO_ID);
  });
});
