/**
 * PiAgentSessionAdapter — embed @oh-my-pi/pi-coding-agent createAgentSession()
 * behind Hive DispatchOptions / DispatchResult.
 *
 * Production path uses dynamic import. Tests inject createAgentSession via input.
 */

import type { AgentContext } from '../types/core.js';
import type { DispatchOptions, DispatchResult } from '../types/dispatch.js';
import type { ProviderManager } from '../../providers/ProviderManager.js';
import { createPiAuthAndModel } from '../../providers/pi-auth-bridge.js';
import type { BridgedCustomTool } from './hive-tool-bridge.js';
import { createHiveSecurityExtension } from './pi-security-extension.js';
import {
  createCompletionVerifierService,
} from '../completion/CompletionVerifier.js';
import { TaskTraceCollector } from '../completion/TaskTrace.js';
import type { CompletionVerifyResult } from '../completion/types.js';

/** Default tool-round budget when DispatchOptions.maxTurns is omitted. */
export const HIVE_DEFAULT_MAX_TURNS = 40;

export interface PiSessionHandle {
  abort: () => void;
}

export interface HiveHistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface RunWithPiAgentSessionInput {
  task: string;
  options?: DispatchOptions;
  systemPrompt: string;
  cwd: string;
  providerManager: ProviderManager;
  hiveCustomTools: BridgedCustomTool[];
  abortController: AbortController;
  onActiveSession?: (session: PiSessionHandle) => void;
  /** Called on pi events so TimeoutCapability can refresh stall heartbeat. */
  onActivity?: () => void;
  /** AgentContext for subagent → worker hook bridging (optional). */
  context?: AgentContext;
  /**
   * Prior Hive session turns to seed into pi SessionManager before prompt.
   * Empty / omitted for first turn.
   */
  historyMessages?: HiveHistoryMessage[];
  /**
   * Test-only injection point. When omitted, dynamically imports
   * `@oh-my-pi/pi-coding-agent`.
   */
  createAgentSession?: (opts: Record<string, unknown>) => Promise<{
    session: {
      subscribe: (listener: (event: any) => void) => () => void;
      prompt: (text: string) => Promise<unknown>;
      abort: (options?: unknown) => void;
      dispose: (options?: unknown) => Promise<void>;
    };
    eventBus?: {
      on: (channel: string, handler: (data: unknown) => void) => () => void;
    };
  }>;
  /** Test-only SessionManager override. */
  sessionManager?: unknown;
  /** Test-only auth/model injection (skips createPiAuthAndModel). */
  authAndModel?: {
    authStorage: unknown;
    modelRegistry: unknown;
    model: unknown;
  };
  /**
   * Require a concrete delivery tool before the turn may complete.
   * Used by Desktop document tasks so a preview-only response cannot be
   * reported as a successful file delivery.
   */
  requiredDeliveryTool?: string;
  /** Override maxTurns (defaults to options.maxTurns ?? HIVE_DEFAULT_MAX_TURNS). */
  maxTurns?: number;
}

type MutableDispatch = {
  text: string;
  finalText: string;
  tools: string[];
  completedTools?: string[];
  success: boolean;
  error?: string;
  blockedMessage?: string;
  toolRounds?: number;
};

function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object' && err !== null) {
    const name = (err as { name?: string }).name;
    if (name === 'AbortError') return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /aborted|abort/i.test(msg);
}

/**
 * Seed prior Hive turns into a pi SessionManager (best-effort).
 * Assistant messages must carry a real Usage object — pi compaction calls
 * `usage.orchestration` without a null check and crashes on bare text stubs.
 * Exported for unit tests.
 */
export function seedPiSessionHistory(
  sessionManager: { appendMessage?: (message: unknown) => unknown } | null | undefined,
  history: HiveHistoryMessage[] | undefined,
): number {
  if (!sessionManager?.appendMessage || !history?.length) return 0;
  let seeded = 0;
  const now = Date.now();
  for (const msg of history) {
    if (msg.role === 'system') continue;
    const content = typeof msg.content === 'string' ? msg.content.trim() : '';
    if (!content) continue;
    try {
      if (msg.role === 'assistant') {
        sessionManager.appendMessage({
          role: 'assistant',
          content: [{ type: 'text', text: content }],
          api: 'openai-completions',
          provider: 'hive',
          model: 'history',
          usage: HIVE_HISTORY_USAGE_STUB,
          stopReason: 'stop',
          timestamp: now + seeded,
        });
      } else {
        sessionManager.appendMessage({
          role: 'user',
          content: [{ type: 'text', text: content }],
          timestamp: now + seeded,
        });
      }
      seeded += 1;
    } catch {
      // ignore shape mismatches — system-prompt history is the fallback
    }
  }
  return seeded;
}

/** Minimal Usage so pi compaction/token math never sees undefined usage. */
const HIVE_HISTORY_USAGE_STUB = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/**
 * Map a single pi AgentSessionEvent onto Hive DispatchOptions callbacks.
 * Exported for unit tests.
 */
export function mapPiSessionEventToDispatch(
  event: any,
  options: DispatchOptions | undefined,
  state: MutableDispatch,
): void {
  switch (event?.type) {
    case 'agent_start':
      options?.onPhase?.('execute', '');
      break;

    case 'message_update': {
      const ame = event.assistantMessageEvent;
      if (!ame) break;
      if (ame.type === 'text_delta' && typeof ame.delta === 'string') {
        state.text += ame.delta;
        state.finalText += ame.delta;
      } else if (
        (ame.type === 'thinking_delta' || ame.type === 'reasoning_delta') &&
        typeof ame.delta === 'string'
      ) {
        options?.onReasoning?.(ame.delta);
      }
      break;
    }

    case 'tool_execution_start':
      // Text before a tool call is operational narration ("let me check…"),
      // not the final answer. Keep only the assistant segment after the last
      // tool invocation for the user-visible response.
      state.finalText = '';
      options?.onTool?.(event.toolName, event.args);
      if (typeof event.toolName === 'string' && !state.tools.includes(event.toolName)) {
        state.tools.push(event.toolName);
      }
      break;

    case 'tool_execution_end':
      options?.onToolResult?.(event.toolName, event.result);
      if (typeof event.toolName === 'string' && !state.tools.includes(event.toolName)) {
        state.tools.push(event.toolName);
      }
      if (
        !event.isError &&
        typeof event.toolName === 'string' &&
        !state.completedTools?.includes(event.toolName)
      ) {
        state.completedTools ??= [];
        state.completedTools.push(event.toolName);
      }
      if (event.isError) {
        state.blockedMessage =
          typeof event.result === 'string'
            ? event.result
            : `Tool ${event.toolName} failed`;
      }
      break;

    case 'agent_end':
      // Completion is emitted after session.prompt() resolves, once delivery
      // requirements and the final assistant segment have been checked.
      break;

    default:
      break;
  }
}

/**
 * Best-effort bridge of pi task subagent events → Hive worker:* hooks.
 * Must never throw into the main session complete path.
 */
function wireSubagentHooks(
  eventBus: { on: (channel: string, handler: (data: unknown) => void) => () => void } | undefined,
  context: AgentContext | undefined,
): () => void {
  if (!eventBus || !context?.hookRegistry) {
    return () => {};
  }

  const unsubs: Array<() => void> = [];
  const sessionId = context.hookRegistry.getSessionId?.() ?? 'default';

  try {
    unsubs.push(
      eventBus.on('task:subagent:lifecycle', (data: unknown) => {
        try {
          const payload = data as {
            id?: string;
            agent?: string;
            description?: string;
            status?: string;
          };
          const workerId = payload.id ?? 'unknown';
          if (payload.status === 'started') {
            void context.hookRegistry.emit('worker:start', {
              workerId,
              workerType: payload.agent ?? 'task',
              description: payload.description,
              sessionId,
              timestamp: new Date(),
            });
          } else if (
            payload.status === 'completed' ||
            payload.status === 'failed' ||
            payload.status === 'aborted'
          ) {
            void context.hookRegistry.emit('worker:complete', {
              workerId,
              workerType: payload.agent ?? 'task',
              success: payload.status === 'completed',
              error:
                payload.status === 'failed' || payload.status === 'aborted'
                  ? payload.status
                  : undefined,
              sessionId,
              timestamp: new Date(),
            });
          }
        } catch (err) {
          console.warn(
            '[PiAgentSessionAdapter] subagent lifecycle bridge failed:',
            err instanceof Error ? err.message : err,
          );
        }
      }),
    );

    unsubs.push(
      eventBus.on('task:subagent:event', (data: unknown) => {
        try {
          const payload = data as {
            id?: string;
            event?: { type?: string; toolName?: string; args?: unknown; result?: unknown };
          };
          const workerId = payload.id ?? 'unknown';
          const ev = payload.event;
          if (!ev) return;
          if (ev.type === 'tool_execution_start') {
            void context.hookRegistry.emit('worker:tool-call', {
              workerId,
              workerType: 'task',
              toolName: ev.toolName,
              input: ev.args,
              sessionId,
              timestamp: new Date(),
            });
          } else if (ev.type === 'tool_execution_end') {
            void context.hookRegistry.emit('worker:tool-result', {
              workerId,
              workerType: 'task',
              toolName: ev.toolName,
              output: ev.result,
              sessionId,
              timestamp: new Date(),
            });
          }
        } catch (err) {
          console.warn(
            '[PiAgentSessionAdapter] subagent event bridge failed:',
            err instanceof Error ? err.message : err,
          );
        }
      }),
    );
  } catch (err) {
    console.warn(
      '[PiAgentSessionAdapter] failed to subscribe eventBus:',
      err instanceof Error ? err.message : err,
    );
  }

  return () => {
    for (const off of unsubs) {
      try {
        off();
      } catch {
        // ignore
      }
    }
  };
}

function mergeVerification(
  a: CompletionVerifyResult,
  b: CompletionVerifyResult,
): CompletionVerifyResult {
  return {
    passed: a.passed && b.passed,
    results: [...a.results, ...b.results],
  };
}

/**
 * Run one Hive dispatch turn through createAgentSession().
 */
export async function runWithPiAgentSession(
  input: RunWithPiAgentSessionInput,
): Promise<DispatchResult> {
  const startTime = Date.now();
  const state: MutableDispatch = {
    text: '',
    finalText: '',
    tools: [],
    completedTools: [],
    success: true,
    toolRounds: 0,
  };

  const maxTurns =
    input.maxTurns ?? input.options?.maxTurns ?? HIVE_DEFAULT_MAX_TURNS;
  const collector = new TaskTraceCollector(input.task);

  let session: {
    subscribe: (listener: (event: any) => void) => () => void;
    prompt: (text: string) => Promise<unknown>;
    abort: (options?: unknown) => void;
    dispose: (options?: unknown) => Promise<void>;
  } | null = null;
  let unsubscribe: (() => void) | undefined;
  let unwireSubagents: (() => void) | undefined;
  let abortFromSignal: (() => void) | undefined;

  try {
    if (input.abortController.signal.aborted) {
      return {
        text: '',
        success: false,
        duration: Date.now() - startTime,
        error: 'Request aborted',
        tools: [],
        verification: { passed: true, results: [] },
      };
    }

    const { authStorage, modelRegistry, model } =
      input.authAndModel ??
      (await createPiAuthAndModel({
        providerManager: input.providerManager,
        modelId: input.options?.modelId,
      }));

    let createAgentSession = input.createAgentSession;
    // SessionManager shape varies by pi version; treat as best-effort seed target.
    let SessionManager: { inMemory: (...args: never[]) => unknown } | undefined;
    let settings: unknown | undefined;

    if (!createAgentSession) {
      const omp = await import('@oh-my-pi/pi-coding-agent');
      createAgentSession = omp.createAgentSession as unknown as NonNullable<
        RunWithPiAgentSessionInput['createAgentSession']
      >;
      SessionManager = omp.SessionManager as { inMemory: (...args: never[]) => unknown };
      try {
        const Settings = omp.Settings as {
          isolated?: (overrides?: Record<string, unknown>) => unknown;
        };
        if (typeof Settings?.isolated === 'function') {
          const { HIVE_PI_COMPACTION_OVERRIDES } = await import('./pi-session-settings.js');
          settings = Settings.isolated({ ...HIVE_PI_COMPACTION_OVERRIDES });
        }
      } catch {
        // settings optional
      }
    }

    if (!createAgentSession) {
      throw new Error('createAgentSession is unavailable');
    }

    const sessionManager =
      input.sessionManager ??
      (SessionManager?.inMemory?.() as
        | { appendMessage?: (message: unknown) => unknown }
        | undefined) ??
      { inMemory: true };

    seedPiSessionHistory(
      sessionManager as { appendMessage?: (message: unknown) => unknown },
      input.historyMessages,
    );

    const created = await createAgentSession({
      cwd: input.cwd,
      authStorage,
      modelRegistry,
      model,
      sessionManager,
      ...(settings ? { settings } : {}),
      systemPrompt: input.systemPrompt,
      toolNames: [
        'read',
        'bash',
        'edit',
        'write',
        'glob',
        'grep',
        'web_search',
        'task',
        // Hive customTools — must be listed when restrictToolNames is true
        'send-file',
        'remember',
        'env',
        'ask-user',
        'web-fetch',
      ],
      // IMPORTANT: pi hard-drops options.customTools when restrictToolNames=true.
      // Keep the allowlist via toolNames + disable MCP/LSP/extensions instead.
      restrictToolNames: false,
      customTools: input.hiveCustomTools,
      extensions: [createHiveSecurityExtension()],
      enableMCP: false,
      enableLsp: false,
      enableIrc: false,
      disableExtensionDiscovery: true,
      hasUI: false,
      autoApprove: true,
      requireYieldTool: false,
    });

    session = created.session;
    input.onActiveSession?.({
      abort: () => {
        try {
          session?.abort();
        } catch {
          // ignore
        }
      },
    });

    abortFromSignal = () => {
      try {
        session?.abort();
      } catch {
        // ignore
      }
    };
    input.abortController.signal.addEventListener('abort', abortFromSignal, {
      once: true,
    });

    const openToolCalls: Array<{ name: string; args: unknown; index: number }> = [];

    unsubscribe = session.subscribe((event) => {
      try {
        input.onActivity?.();
        mapPiSessionEventToDispatch(event, input.options, state);

        if (event?.type === 'tool_execution_start') {
          state.toolRounds = (state.toolRounds ?? 0) + 1;
          if (typeof event.toolName === 'string') {
            const index = collector.recordToolCall(event.toolName, event.args);
            openToolCalls.push({
              name: event.toolName,
              args: event.args,
              index,
            });
          }
          if ((state.toolRounds ?? 0) > maxTurns) {
            state.success = false;
            state.error = `maxTurns (${maxTurns}) exceeded`;
            try {
              session?.abort();
            } catch {
              // ignore
            }
            input.abortController.abort();
          }
        } else if (event?.type === 'tool_execution_end') {
          if (typeof event.toolName === 'string') {
            const pendingIdx = openToolCalls.findIndex((c) => c.name === event.toolName);
            const pending = pendingIdx >= 0 ? openToolCalls.splice(pendingIdx, 1)[0] : undefined;
            if (pending) {
              collector.recordToolResultAt(pending.index, event.result);
              collector.recordArtifactsFromToolCall(
                event.toolName,
                pending.args,
                event.result,
              );
            } else {
              collector.recordToolResult(event.toolName, event.result);
              collector.recordArtifactsFromToolCall(
                event.toolName,
                event.args,
                event.result,
              );
            }
          }
        }
      } catch (err) {
        console.warn(
          '[PiAgentSessionAdapter] event map failed:',
          err instanceof Error ? err.message : err,
        );
      }
    });

    unwireSubagents = wireSubagentHooks(created.eventBus, input.context);

    await session.prompt(input.task);

    if (input.abortController.signal.aborted) {
      state.success = false;
      state.error = state.error ?? 'Request aborted';
    }

    const finalText = (state.finalText || state.text).trim();
    collector.setResponseText(finalText);

    const missingDelivery =
      input.requiredDeliveryTool &&
      !state.completedTools?.includes(input.requiredDeliveryTool);

    const deliveryVerification: CompletionVerifyResult = missingDelivery
      ? {
          passed: false,
          results: [{
            verifierId: 'file-delivery',
            passed: false,
            message:
              `任务尚未交付最终文件：必须调用 ${input.requiredDeliveryTool}。`,
            retryable: true,
          }],
        }
      : { passed: true, results: [] };

    const scenarioVerification = await createCompletionVerifierService().verify(
      collector.getTrace(),
    );
    const verification = mergeVerification(deliveryVerification, scenarioVerification);

    if (!verification.passed) {
      state.success = false;
      const reasons = verification.results
        .filter((r) => !r.passed)
        .map((r) => r.message);
      state.error = reasons[0] ?? state.error ?? '完成校验未通过';
      input.options?.onTaskProgress?.({
        phase: 'blocked',
        message: state.error,
        reasons,
      });
    } else if (!input.abortController.signal.aborted) {
      if (finalText) input.options?.onText?.(finalText);
      input.options?.onTaskProgress?.({ phase: 'done' });
    }

    return {
      text: finalText,
      finalText,
      success: state.success && !state.error,
      duration: Date.now() - startTime,
      tools: state.tools,
      error: state.error,
      verification,
    };
  } catch (error) {
    if (isAbortError(error) || input.abortController.signal.aborted) {
      return {
        text: (state.finalText || state.text).trim(),
        finalText: (state.finalText || state.text).trim(),
        success: false,
        duration: Date.now() - startTime,
        error: state.error ?? 'Request aborted',
        tools: state.tools,
        verification: { passed: true, results: [] },
      };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    return {
      text: (state.finalText || state.text).trim(),
      finalText: (state.finalText || state.text).trim(),
      success: false,
      duration: Date.now() - startTime,
      error: err.message,
      tools: state.tools,
      verification: { passed: true, results: [] },
    };
  } finally {
    if (abortFromSignal) {
      input.abortController.signal.removeEventListener('abort', abortFromSignal);
    }
    try {
      unsubscribe?.();
    } catch {
      // ignore
    }
    try {
      unwireSubagents?.();
    } catch {
      // ignore
    }
    if (session) {
      try {
        await session.dispose();
      } catch {
        // ignore dispose failures
      }
    }
  }
}
