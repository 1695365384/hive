/**
 * AgentLoop context-layer helpers — history / memory prompt blocks + compaction overrides.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  formatHistoryForPrompt,
  HIVE_MEMORY_PROMPT_MAX_CHARS,
} from '../../../src/agents/core/AgentLoop.js';
import { HIVE_PI_COMPACTION_OVERRIDES, buildHivePiSessionOverrides } from '../../../src/agents/core/pi-session-settings.js';
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

describe('pi session settings', () => {
  it('enables compaction + mnemopi overrides for createAgentSession', () => {
    expect(HIVE_PI_COMPACTION_OVERRIDES['compaction.enabled']).toBe(true);
    expect(HIVE_PI_COMPACTION_OVERRIDES['compaction.midTurnEnabled']).toBe(false);
    const overrides = buildHivePiSessionOverrides({
      workspaceDir: '/tmp/hive-ws',
      userId: 'user/ada',
    });
    expect(overrides['memory.backend']).toBe('mnemopi');
    expect(overrides['mnemopi.noEmbeddings']).toBe(true);
    expect(overrides['mnemopi.autoRecall']).toBe(true);
    expect(overrides['mnemopi.bank']).toBe('user_ada');
    expect(String(overrides['mnemopi.dbPath'])).toContain('/user_ada.db');
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
    expect(appendMessage.mock.calls[1][0]).toMatchObject({
      role: 'assistant',
      usage: expect.objectContaining({ totalTokens: 0 }),
      stopReason: 'stop',
    });
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
