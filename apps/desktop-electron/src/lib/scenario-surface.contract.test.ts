/**
 * Desktop contract: empty-state PPT send resolves to office-document.
 */

import { describe, it, expect } from 'vitest';
import { resolveSendPayload } from '../../../../packages/core/src/routing/scenario-surface.ts';

describe('scenario surface desktop contract', () => {
  it('empty-state ppt locks office-document', () => {
    const r = resolveSendPayload({ text: '', surfaceId: 'ppt' });
    expect(r.scenarioId).toBe('office-document');
    expect(r.prompt).toMatch(/PPT/i);
  });

  it('slash /ppt forces office-document', () => {
    const r = resolveSendPayload({ text: '/ppt 季度复盘' });
    expect(r.scenarioId).toBe('office-document');
    expect(r.prompt).toBe('季度复盘');
  });
});
