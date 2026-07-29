/**
 * ScenarioSurface catalog + slash resolve (Prompt/Graph entry layer).
 */

import { describe, it, expect } from 'vitest';
import {
  listScenarioSurfaces,
  listEmptyStateSurfaces,
  getSurface,
  resolveSlash,
  resolveSendPayload,
  isKnownForcedScenarioId,
} from '../../../src/routing/scenario-surface.js';
import { OFFICE_SCENARIO_ID } from '../../../src/routing/scenarios/office.scenario.js';

describe('ScenarioSurface catalog', () => {
  it('lists ppt surface bound to office-document', () => {
    const ppt = getSurface('ppt');
    expect(ppt?.scenarioId).toBe(OFFICE_SCENARIO_ID);
    expect(ppt?.slash).toContain('ppt');
    expect(listEmptyStateSurfaces().some((s) => s.id === 'ppt')).toBe(true);
  });

  it('doc/meeting/data are prompt-only (no fake scenario lock)', () => {
    for (const id of ['doc', 'meeting', 'data'] as const) {
      expect(getSurface(id)?.scenarioId).toBeUndefined();
    }
  });

  it('isKnownForcedScenarioId only for surfaces with engine ids', () => {
    expect(isKnownForcedScenarioId(OFFICE_SCENARIO_ID)).toBe(true);
    expect(isKnownForcedScenarioId('no-such-scenario')).toBe(false);
  });
});

describe('resolveSlash', () => {
  it('parses /ppt with remaining prompt', () => {
    const r = resolveSlash('/ppt 季度复盘');
    expect(r.matched).toBe(true);
    expect(r.scenarioId).toBe(OFFICE_SCENARIO_ID);
    expect(r.prompt).toBe('季度复盘');
    expect(r.surfaceId).toBe('ppt');
  });

  it('parses /pptx alias', () => {
    const r = resolveSlash('/pptx');
    expect(r.matched).toBe(true);
    expect(r.scenarioId).toBe(OFFICE_SCENARIO_ID);
    expect(r.prompt).toBe('');
  });

  it('leaves plain text unmatched', () => {
    const r = resolveSlash('帮我做一份 PPT');
    expect(r.matched).toBe(false);
    expect(r.scenarioId).toBeUndefined();
    expect(r.prompt).toBe('帮我做一份 PPT');
  });

  it('unknown slash stays unmatched (prompt intact)', () => {
    const r = resolveSlash('/unknown hello');
    expect(r.matched).toBe(false);
    expect(r.prompt).toBe('/unknown hello');
  });
});

describe('resolveSendPayload', () => {
  it('empty-state ppt uses defaultPrompt and forces office', () => {
    const r = resolveSendPayload({ text: '', surfaceId: 'ppt' });
    expect(r.scenarioId).toBe(OFFICE_SCENARIO_ID);
    expect(r.prompt).toMatch(/PPT/);
  });

  it('slash with empty rest uses defaultPrompt', () => {
    const r = resolveSendPayload({ text: '/ppt' });
    expect(r.scenarioId).toBe(OFFICE_SCENARIO_ID);
    expect(r.prompt).toMatch(/PPT/);
  });

  it('lists at least one forced surface', () => {
    expect(listScenarioSurfaces().some((s) => s.scenarioId)).toBe(true);
  });
});
