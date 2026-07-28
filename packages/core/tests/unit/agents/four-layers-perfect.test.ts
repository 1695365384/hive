/**
 * Four-layers perfect — acceptance fixtures against the plan’s满分标准.
 *
 * Prompt: 问答 / 写文件+send-file / PPT 交付 / cancel 固定文案
 * Context: 次轮 history + memory 注入；compaction 配置存在
 * Loop: verifier 无 send-file → blocked；maxTurns abort；Continue 上限
 * Harness: RawTool 桥；jail 拒 ../；cancel abort
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { PromptTemplate } from '../../../src/agents/prompts/PromptTemplate.js';
import {
  formatHistoryForPrompt,
  formatMemoryForPrompt,
  HIVE_MEMORY_PROMPT_MAX_CHARS,
} from '../../../src/agents/core/AgentLoop.js';
import { HIVE_PI_COMPACTION_OVERRIDES } from '../../../src/agents/core/pi-session-settings.js';
import {
  runWithPiAgentSession,
  HIVE_DEFAULT_MAX_TURNS,
} from '../../../src/agents/core/PiAgentSessionAdapter.js';
import { evaluatePiToolSecurity } from '../../../src/agents/core/pi-security-extension.js';
import { buildHiveCustomTools } from '../../../src/agents/core/hive-tool-bridge.js';
import { officeCompletionVerifier } from '../../../src/agents/completion/verifiers/office.js';
import { GoalStore } from '../../../src/agents/completion/GoalStore.js';
import {
  MAX_GOAL_CONTINUES,
  resolveIdleContinuation,
} from '../../../src/agents/completion/TodoEnforcer.js';
import {
  setAllowedRoots,
  _resetAllowedRoots,
} from '../../../src/tools/built-in/utils/security.js';
import {
  createSessionFsContext,
  runWithSessionFs,
} from '../../../src/workspace/session-fs.js';
import type { TaskTrace } from '../../../src/agents/completion/types.js';

function agentSystemText(): string {
  return new PromptTemplate().render('agent-system', {});
}

function mockSession(handlers: {
  prompt?: (task: string) => Promise<void>;
  emit?: (listeners: Array<(e: any) => void>) => void;
  abort?: ReturnType<typeof vi.fn>;
}) {
  const listeners: Array<(e: any) => void> = [];
  const abort = handlers.abort ?? vi.fn();
  return {
    createAgentSession: vi.fn(async () => ({
      session: {
        subscribe: (listener: (event: any) => void) => {
          listeners.push(listener);
          return () => {};
        },
        prompt: async (task: string) => {
          if (handlers.emit) handlers.emit(listeners);
          else if (handlers.prompt) await handlers.prompt(task);
        },
        abort,
        dispose: vi.fn(async () => {}),
      },
      eventBus: { on: () => () => {} },
    })),
    abort,
    listeners,
  };
}

describe('Prompt 满分 fixtures', () => {
  const text = agentSystemText();

  it('问答场景：单源工具名，不强制交付，可直接回答', () => {
    expect(text).toContain('`web_search`');
    expect(text).toContain('`ask-user`');
    expect(text).not.toMatch(/\|\s*`web-search`\s*\|/);
    expect(text).not.toMatch(/\|\s*`file`\s*\|/);
    // Q&A does not require send-file — checklist still mentions it for delivery tasks
    expect(text).toMatch(/先理解，再行动/);
  });

  it('写文件+send-file 场景：write / send-file 固定文案', () => {
    expect(text).toContain('`write`');
    expect(text).toContain('`send-file`');
    expect(text).toMatch(/唯一交付方式/);
    expect(text).toMatch(/只有 `send-file` 之后才算交付/);
  });

  it('PPT 交付场景：必须 send-file，禁止预览冒充完成', () => {
    expect(text).toMatch(/做 PPT|演示文稿|汇报材料/);
    expect(text).toContain('`send-file`');
    expect(text).toContain('不要在没有 send-file 的情况下说');
  });

  it('cancel 场景：系统提示要求中止时立刻停，不假完成', () => {
    expect(text).toMatch(/中断与取消/);
    expect(text).toMatch(/立即停止|不要假装任务已完成/);
  });
});

describe('Context 满分 fixtures', () => {
  it('第二 turn 的 history 块含上一轮内容', () => {
    const block = formatHistoryForPrompt([
      { role: 'user', content: '我叫 Ada，偏好简体中文' },
      { role: 'assistant', content: '好的 Ada，已记下。' },
    ]);
    expect(block).toContain('Conversation history');
    expect(block).toContain('我叫 Ada');
    expect(block).toContain('好的 Ada');
  });

  it('remember 写入后可注入后续 turn 的 memory 段', () => {
    const block = formatMemoryForPrompt('用户偏好简体中文\n喜欢短回复');
    expect(block).toContain('Persistent memory');
    expect(block).toContain('用户偏好简体中文');
    expect(block).toContain('喜欢短回复');
  });

  it('超长 memory 按预算截断', () => {
    const raw = 'x'.repeat(HIVE_MEMORY_PROMPT_MAX_CHARS + 200);
    const block = formatMemoryForPrompt(raw);
    expect(block.length).toBeLessThan(raw.length + 80);
    expect(block).toMatch(/…$/m);
  });

  it('长会话 compaction 配置存在且开启', () => {
    expect(HIVE_PI_COMPACTION_OVERRIDES['compaction.enabled']).toBe(true);
    expect(HIVE_PI_COMPACTION_OVERRIDES['compaction.midTurnEnabled']).toBe(false);
  });
});

describe('Loop 满分 fixtures', () => {
  it('office 无 send-file → verifier fail → Goal blocked', async () => {
    const trace: TaskTrace = {
      task: '做一个 PPT',
      toolCalls: [{ toolName: 'write', input: { path: 'deck.html' } }],
      workerSpawns: [],
      artifacts: [],
      responseText: '预览已生成。',
    };
    const verify = await officeCompletionVerifier.verify(trace);
    expect(verify.passed).toBe(false);

    const store = new GoalStore();
    store.start('s1', trace.task);
    store.markBlocked('s1', [verify.message]);
    const goal = store.get('s1');
    expect(goal?.status).toBe('blocked');
    expect(goal?.reasons[0]).toMatch(/send-file|delivery/i);
  });

  it('maxTurns 耗尽 → abort', async () => {
    const { createAgentSession, abort } = mockSession({
      emit: (listeners) => {
        for (const listener of listeners) {
          listener({ type: 'tool_execution_start', toolName: 'bash', args: { command: '1' } });
          listener({ type: 'tool_execution_end', toolName: 'bash', result: 'ok' });
          listener({ type: 'tool_execution_start', toolName: 'bash', args: { command: '2' } });
          listener({ type: 'tool_execution_end', toolName: 'bash', result: 'ok' });
        }
      },
    });

    const result = await runWithPiAgentSession({
      task: 'loop',
      systemPrompt: 'sys',
      cwd: process.cwd(),
      providerManager: {} as any,
      hiveCustomTools: [],
      abortController: new AbortController(),
      maxTurns: 1,
      createAgentSession,
      authAndModel: { authStorage: {}, modelRegistry: {}, model: {} },
      sessionManager: {},
    });

    expect(abort).toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/maxTurns/);
    expect(HIVE_DEFAULT_MAX_TURNS).toBeGreaterThan(0);
  });

  it('Continue 有上限 MAX_GOAL_CONTINUES', () => {
    const store = new GoalStore();
    store.start('s2', '做一个 PPT');
    store.markBlocked('s2', ['缺 send-file']);
    const goal = store.get('s2')!;
    goal.continueAttempts = MAX_GOAL_CONTINUES;
    const decision = resolveIdleContinuation(goal, { inFlight: false });
    expect(decision.action).toBe('exhausted');
    expect(MAX_GOAL_CONTINUES).toBe(3);
  });
});

describe('Harness 满分 fixtures', () => {
  const workspace = resolve('/tmp/hive-four-layers-jail');

  beforeEach(() => {
    setAllowedRoots([workspace]);
  });

  afterEach(() => {
    _resetAllowedRoots();
  });

  it('jail 拒绝 ../ 逃逸', async () => {
    const sessionFs = createSessionFsContext('jail', workspace);
    await runWithSessionFs(sessionFs, async () => {
      const verdict = evaluatePiToolSecurity('read', {
        path: resolve(workspace, '../outside-secret.txt'),
      });
      expect(verdict.block).toBe(true);
      if (verdict.block) {
        expect(verdict.reason).toMatch(/jail|Path blocked/i);
      }
    });
  });

  it('5 个 Hive 扩展是 CustomTool/Raw 路径（无 ai Tool 外壳字段）', () => {
    const tools = buildHiveCustomTools({} as any);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      ['ask-user', 'env', 'remember', 'send-file', 'web-fetch'].sort(),
    );
    for (const t of tools) {
      expect(typeof t.execute).toBe('function');
      expect(t).not.toHaveProperty('inputSchema'); // AI SDK Tool shape
      expect(t.parameters).toBeDefined();
    }
  });

  it('cancel：abortSignal 触发 session.abort', async () => {
    const abort = vi.fn();
    let resolvePrompt: (() => void) | undefined;
    const createAgentSession = vi.fn(async () => ({
      session: {
        subscribe: () => () => {},
        prompt: () =>
          new Promise<void>((resolve) => {
            resolvePrompt = resolve;
          }),
        abort,
        dispose: vi.fn(async () => {}),
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
      authAndModel: { authStorage: {}, modelRegistry: {}, model: {} },
      sessionManager: {},
    });

    await vi.waitFor(() => expect(createAgentSession).toHaveBeenCalled());
    abortController.abort();
    resolvePrompt?.();
    const result = await runPromise;
    expect(abort).toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
});
