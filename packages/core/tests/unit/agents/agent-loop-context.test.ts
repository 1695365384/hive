/**
 * AgentLoop context-layer helpers — history / memory prompt blocks + compaction overrides.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  formatHistoryForPrompt,
  HIVE_MEMORY_PROMPT_MAX_CHARS,
} from '../../../src/agents/core/AgentLoop.js';
import { HIVE_PI_COMPACTION_OVERRIDES } from '../../../src/agents/core/pi-session-settings.js';
import { seedPiSessionHistory } from '../../../src/agents/core/PiAgentSessionAdapter.js';

describe('formatHistoryForPrompt', () => {
  it('includes prior turns for the next system prompt', () => {
    const block = formatHistoryForPrompt([
      { role: 'user', content: '我叫 Ada' },
      { role: 'assistant', content: '你好 Ada' },
    ]);
    expect(block).toContain('Conversation history');
    expect(block).toContain('Ada');
    expect(block).toContain('你好 Ada');
  });

  it('returns empty when there is no history', () => {
    expect(formatHistoryForPrompt([])).toBe('');
    expect(formatHistoryForPrompt(undefined)).toBe('');
  });
});

describe('pi compaction settings', () => {
  it('enables compaction overrides for createAgentSession', () => {
    expect(HIVE_PI_COMPACTION_OVERRIDES['compaction.enabled']).toBe(true);
    expect(HIVE_PI_COMPACTION_OVERRIDES['compaction.midTurnEnabled']).toBe(true);
  });
});

describe('seedPiSessionHistory', () => {
  it('appends user/assistant messages and skips system', () => {
    const appendMessage = vi.fn();
    const seeded = seedPiSessionHistory(
      { appendMessage },
      [
        { role: 'system', content: 'ignore' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    );
    expect(seeded).toBe(2);
    expect(appendMessage).toHaveBeenCalledTimes(2);
  });
});

describe('memory prompt budget', () => {
  it('exposes a finite clip budget', () => {
    expect(HIVE_MEMORY_PROMPT_MAX_CHARS).toBeGreaterThan(100);
  });

  it('formatMemoryForPrompt injects remember content', async () => {
    const { formatMemoryForPrompt } = await import(
      '../../../src/agents/core/AgentLoop.js'
    );
    expect(formatMemoryForPrompt('偏好简体')).toContain('偏好简体');
  });
});
