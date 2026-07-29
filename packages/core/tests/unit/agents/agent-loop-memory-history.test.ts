/**
 * AgentLoop Context wiring — second-turn systemPrompt contains history + memory.
 * Also covers history truncation at HIVE_HISTORY_MAX_MESSAGES and query-aware recall.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const runWithPiAgentSession = vi.fn(async (input: {
  systemPrompt: string;
  historyMessages?: Array<{ role: string; content: string }>;
  task: string;
}) => ({
  text: `echo:${input.task}`,
  finalText: `echo:${input.task}`,
  success: true,
  duration: 1,
  tools: [],
  verification: { passed: true, results: [] },
}));

vi.mock('../../../src/agents/core/PiAgentSessionAdapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/agents/core/PiAgentSessionAdapter.js')>();
  return {
    ...actual,
    runWithPiAgentSession: (...args: unknown[]) =>
      (runWithPiAgentSession as any)(...args),
  };
});

vi.mock('../../../src/agents/core/hive-tool-bridge.js', () => ({
  buildHiveCustomTools: () => [],
  bridgeMcpToolsToCustomTools: () => [],
}));

import { AgentLoop, HIVE_HISTORY_MAX_MESSAGES } from '../../../src/agents/core/AgentLoop.js';

function makeSessionCap(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  return {
    loadSession: vi.fn(async () => ({ id: 'chat-1', messages })),
    createSession: vi.fn(async () => ({ id: 'chat-1', messages: [] })),
    getMessages: vi.fn(() => messages),
    getCurrentSession: vi.fn(() => ({ id: 'chat-1', messages })),
    addUserMessage: vi.fn(async () => ({})),
    addAssistantMessage: vi.fn(async () => ({})),
  };
}

function initLoop(opts: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  readMemory: ReturnType<typeof vi.fn>;
}) {
  const sessionCap = makeSessionCap(opts.messages);
  const loop = new AgentLoop();
  loop.initialize({
    hookRegistry: { getSessionId: () => 'chat-1' },
    timeoutCap: {
      getConfig: () => ({
        heartbeatInterval: 30_000,
        stallTimeout: 120_000,
      }),
      startHeartbeat: vi.fn(),
      stopHeartbeat: vi.fn(),
      updateActivity: vi.fn(),
    },
    providerManager: {},
    mcpManager: { getAllTools: () => ({}) },
    skillRegistry: {
      get: () => null,
      match: () => null,
      generateSkillInstruction: () => '',
    },
    getSessionCap: () => sessionCap,
    fileMemory: {
      readMemory: opts.readMemory,
    },
    currentUserId: 'user-ada',
  } as any);
  return { loop, sessionCap };
}

describe('AgentLoop context injection (满分)', () => {
  beforeEach(() => {
    runWithPiAgentSession.mockClear();
  });

  it('第二 turn 的 systemPrompt 含上一轮 history 与 remember memory', async () => {
    const messages = [
      { role: 'user' as const, content: '我叫 Ada' },
      { role: 'assistant' as const, content: '你好 Ada' },
    ];

    const readMemory = vi.fn(async () => '用户偏好简体中文');
    const { loop } = initLoop({ messages, readMemory });

    await loop.run('还记得我叫什么吗？', { chatId: 'chat-1' });

    expect(runWithPiAgentSession).toHaveBeenCalled();
    const arg = runWithPiAgentSession.mock.calls[0][0];
    expect(arg.systemPrompt).toContain('Conversation history');
    expect(arg.systemPrompt).toContain('我叫 Ada');
    expect(arg.systemPrompt).toContain('Persistent memory');
    expect(arg.systemPrompt).toContain('用户偏好简体中文');
    expect(arg.historyMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: '我叫 Ada' }),
      ]),
    );
  });

  it('history longer than HIVE_HISTORY_MAX_MESSAGES is truncated but still injected', async () => {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (let i = 0; i < HIVE_HISTORY_MAX_MESSAGES + 20; i++) {
      messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: i % 2 === 0 ? `user-msg-${i}` : `asst-msg-${i}`,
      });
    }

    const readMemory = vi.fn(async () => '');
    const { loop } = initLoop({ messages, readMemory });

    await loop.run('继续', { chatId: 'chat-1' });

    const arg = runWithPiAgentSession.mock.calls[0][0];
    expect(arg.historyMessages.length).toBeLessThanOrEqual(HIVE_HISTORY_MAX_MESSAGES);
    expect(arg.historyMessages.length).toBe(HIVE_HISTORY_MAX_MESSAGES);
    // Oldest padded messages dropped; newest kept
    expect(arg.historyMessages.some((m: { content: string }) => m.content === 'user-msg-0')).toBe(
      false,
    );
    expect(
      arg.historyMessages.some(
        (m: { content: string }) => m.content === `asst-msg-${HIVE_HISTORY_MAX_MESSAGES + 19}`,
      ),
    ).toBe(true);
    expect(arg.systemPrompt).toContain('Conversation history');
    expect(arg.systemPrompt).toContain(`asst-msg-${HIVE_HISTORY_MAX_MESSAGES + 19}`);
  });

  it('passes current task as recallQuery to readMemory', async () => {
    const messages = [{ role: 'user' as const, content: 'hi' }];
    const readMemory = vi.fn(async (_userId: string, query?: string) => {
      if (query?.includes('Ada')) return '- 用户名叫 Ada';
      return '';
    });
    const { loop } = initLoop({ messages, readMemory });

    await loop.run('还记得 Ada 的偏好吗？', { chatId: 'chat-1' });

    expect(readMemory).toHaveBeenCalledWith('user-ada', '还记得 Ada 的偏好吗？');
    const arg = runWithPiAgentSession.mock.calls[0][0];
    expect(arg.systemPrompt).toContain('用户名叫 Ada');
  });
});
