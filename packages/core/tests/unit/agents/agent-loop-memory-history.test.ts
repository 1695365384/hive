/**
 * AgentLoop Context wiring — second-turn systemPrompt contains history + memory.
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

import { AgentLoop } from '../../../src/agents/core/AgentLoop.js';

describe('AgentLoop context injection (满分)', () => {
  beforeEach(() => {
    runWithPiAgentSession.mockClear();
  });

  it('第二 turn 的 systemPrompt 含上一轮 history 与 remember memory', async () => {
    const messages = [
      { role: 'user' as const, content: '我叫 Ada' },
      { role: 'assistant' as const, content: '你好 Ada' },
    ];

    const sessionCap = {
      loadSession: vi.fn(async () => ({ id: 'chat-1', messages })),
      createSession: vi.fn(async () => ({ id: 'chat-1', messages: [] })),
      getMessages: vi.fn(() => messages),
      getCurrentSession: vi.fn(() => ({ id: 'chat-1', messages })),
      addUserMessage: vi.fn(async () => ({})),
      addAssistantMessage: vi.fn(async () => ({})),
    };

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
        readMemory: vi.fn(async () => '用户偏好简体中文'),
      },
      currentUserId: 'user-ada',
    } as any);

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
});
