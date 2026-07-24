/**
 * PiAgentSessionAdapter unit tests — fully mocked, no real pi load.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mapPiSessionEventToDispatch,
  runWithPiAgentSession,
} from '../../../src/agents/core/PiAgentSessionAdapter.js';
import type { DispatchOptions } from '../../../src/agents/types/dispatch.js';

describe('mapPiSessionEventToDispatch', () => {
  it('maps text_delta / tool start-end / agent_end', () => {
    const onPhase = vi.fn();
    const onText = vi.fn();
    const onTool = vi.fn();
    const onToolResult = vi.fn();
    const onTaskProgress = vi.fn();
    const options: DispatchOptions = {
      onPhase,
      onText,
      onTool,
      onToolResult,
      onTaskProgress,
    };
    const state = {
      text: '',
      finalText: '',
      tools: [] as string[],
      success: true,
    };

    mapPiSessionEventToDispatch({ type: 'agent_start' }, options, state);
    mapPiSessionEventToDispatch(
      {
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'hi' },
      },
      options,
      state,
    );
    mapPiSessionEventToDispatch(
      {
        type: 'tool_execution_start',
        toolName: 'bash',
        args: { command: 'echo' },
      },
      options,
      state,
    );
    mapPiSessionEventToDispatch(
      {
        type: 'tool_execution_end',
        toolName: 'bash',
        result: 'ok',
      },
      options,
      state,
    );
    mapPiSessionEventToDispatch({ type: 'agent_end', messages: [] }, options, state);

    expect(onPhase).toHaveBeenCalledWith('execute', '');
    expect(onText).not.toHaveBeenCalled();
    expect(onTool).toHaveBeenCalledWith('bash', { command: 'echo' });
    expect(onToolResult).toHaveBeenCalledWith('bash', 'ok');
    expect(onTaskProgress).not.toHaveBeenCalled();
    expect(state.text).toBe('hi');
    expect(state.tools).toEqual(['bash']);
  });

  it('maps thinking_delta to onReasoning', () => {
    const onReasoning = vi.fn();
    const state = { text: '', finalText: '', tools: [] as string[], success: true };
    mapPiSessionEventToDispatch(
      {
        type: 'message_update',
        assistantMessageEvent: { type: 'thinking_delta', delta: 'hmm' },
      },
      { onReasoning },
      state,
    );
    expect(onReasoning).toHaveBeenCalledWith('hmm');
  });
});

describe('runWithPiAgentSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wires callbacks and returns success from mocked session events', async () => {
    const onText = vi.fn();
    const onTool = vi.fn();
    const onToolResult = vi.fn();
    const listeners: Array<(event: any) => void> = [];
    const abort = vi.fn();
    const dispose = vi.fn(async () => {});
    const prompt = vi.fn(async () => {
      for (const listener of listeners) {
        listener({ type: 'agent_start' });
        listener({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: 'hello' },
        });
        listener({
          type: 'tool_execution_start',
          toolName: 'read',
          args: { path: 'a.txt' },
        });
        listener({
          type: 'tool_execution_end',
          toolName: 'read',
          result: 'content',
        });
        listener({ type: 'agent_end', messages: [] });
      }
    });

    const createAgentSession = vi.fn(async () => ({
      session: {
        subscribe: (listener: (event: any) => void) => {
          listeners.push(listener);
          return () => {
            const idx = listeners.indexOf(listener);
            if (idx >= 0) listeners.splice(idx, 1);
          };
        },
        prompt,
        abort,
        dispose,
      },
      eventBus: { on: () => () => {} },
    }));

    const result = await runWithPiAgentSession({
      task: 'say hi',
      options: { onText, onTool, onToolResult },
      systemPrompt: 'sys',
      cwd: process.cwd(),
      providerManager: {} as any,
      hiveCustomTools: [],
      abortController: new AbortController(),
      createAgentSession,
      authAndModel: {
        authStorage: { setRuntimeApiKey: vi.fn() },
        modelRegistry: {},
        model: { id: 'mock', provider: 'mock' },
      },
      sessionManager: {},
    });

    expect(createAgentSession).toHaveBeenCalled();
    expect(onText).toHaveBeenCalledWith('hello');
    expect(onTool).toHaveBeenCalledWith('read', { path: 'a.txt' });
    expect(onToolResult).toHaveBeenCalledWith('read', 'content');
    expect(result.success).toBe(true);
    expect(result.text).toBe('hello');
    expect(dispose).toHaveBeenCalled();
  });

  it('keeps only the assistant segment after the last tool call', async () => {
    const onText = vi.fn();
    const listeners: Array<(event: any) => void> = [];
    const createAgentSession = vi.fn(async () => ({
      session: {
        subscribe: (listener: (event: any) => void) => {
          listeners.push(listener);
          return () => {};
        },
        prompt: async () => {
          for (const listener of listeners) {
            listener({
              type: 'message_update',
              assistantMessageEvent: { type: 'text_delta', delta: '让我先检查环境。' },
            });
            listener({
              type: 'tool_execution_start',
              toolName: 'bash',
              args: { command: 'echo ok' },
            });
            listener({
              type: 'tool_execution_end',
              toolName: 'bash',
              result: 'ok',
            });
            listener({
              type: 'message_update',
              assistantMessageEvent: { type: 'text_delta', delta: '文件已生成。' },
            });
            listener({ type: 'agent_end' });
          }
        },
        abort: vi.fn(),
        dispose: vi.fn(async () => {}),
      },
      eventBus: { on: () => () => {} },
    }));

    const result = await runWithPiAgentSession({
      task: '生成文件',
      options: { onText },
      systemPrompt: 'sys',
      cwd: process.cwd(),
      providerManager: {} as any,
      hiveCustomTools: [],
      abortController: new AbortController(),
      createAgentSession,
      authAndModel: {
        authStorage: {},
        modelRegistry: {},
        model: {},
      },
      sessionManager: {},
    });

    expect(result.text).toBe('文件已生成。');
    expect(result.finalText).toBe('文件已生成。');
    expect(onText).toHaveBeenCalledOnce();
    expect(onText).toHaveBeenCalledWith('文件已生成。');
  });

  it('blocks a document task that never calls the required delivery tool', async () => {
    const onTaskProgress = vi.fn();
    const listeners: Array<(event: any) => void> = [];
    const createAgentSession = vi.fn(async () => ({
      session: {
        subscribe: (listener: (event: any) => void) => {
          listeners.push(listener);
          return () => {};
        },
        prompt: async () => {
          for (const listener of listeners) {
            listener({
              type: 'message_update',
              assistantMessageEvent: { type: 'text_delta', delta: '预览已生成。' },
            });
            listener({ type: 'agent_end' });
          }
        },
        abort: vi.fn(),
        dispose: vi.fn(async () => {}),
      },
      eventBus: { on: () => () => {} },
    }));

    const result = await runWithPiAgentSession({
      task: '做一个 PPT',
      options: { onTaskProgress },
      systemPrompt: 'sys',
      cwd: process.cwd(),
      providerManager: {} as any,
      hiveCustomTools: [],
      abortController: new AbortController(),
      createAgentSession,
      authAndModel: {
        authStorage: {},
        modelRegistry: {},
        model: {},
      },
      sessionManager: {},
      requiredDeliveryTool: 'send-file',
    });

    expect(result.success).toBe(false);
    expect(result.verification?.passed).toBe(false);
    expect(onTaskProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'blocked',
    }));
  });

  it('calls session.abort when abortSignal fires', async () => {
    const abort = vi.fn();
    const dispose = vi.fn(async () => {});
    let resolvePrompt: (() => void) | undefined;
    const prompt = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        }),
    );

    const createAgentSession = vi.fn(async () => ({
      session: {
        subscribe: () => () => {},
        prompt,
        abort,
        dispose,
      },
    }));

    const abortController = new AbortController();
    const runPromise = runWithPiAgentSession({
      task: 'long',
      systemPrompt: 'sys',
      cwd: process.cwd(),
      providerManager: {} as any,
      hiveCustomTools: [],
      abortController,
      createAgentSession,
      authAndModel: {
        authStorage: {},
        modelRegistry: {},
        model: { id: 'mock', provider: 'mock' },
      },
      sessionManager: {},
    });

    // Wait until prompt is in-flight
    await vi.waitFor(() => expect(prompt).toHaveBeenCalled());
    abortController.abort();
    resolvePrompt?.();
    await runPromise;

    expect(abort).toHaveBeenCalled();
    expect(dispose).toHaveBeenCalled();
  });
});
