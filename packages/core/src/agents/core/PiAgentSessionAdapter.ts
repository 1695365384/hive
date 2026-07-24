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

export interface PiSessionHandle {
  abort: () => void;
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
  /** AgentContext for subagent → worker hook bridging (optional). */
  context?: AgentContext;
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
}

type MutableDispatch = {
  text: string;
  finalText: string;
  tools: string[];
  completedTools?: string[];
  success: boolean;
  error?: string;
  blockedMessage?: string;
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
  };

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
    let SessionManager: { inMemory: () => unknown } | undefined;

    if (!createAgentSession) {
      const omp = await import('@oh-my-pi/pi-coding-agent');
      createAgentSession = omp.createAgentSession as unknown as NonNullable<
        RunWithPiAgentSessionInput['createAgentSession']
      >;
      SessionManager = omp.SessionManager;
    }

    if (!createAgentSession) {
      throw new Error('createAgentSession is unavailable');
    }

    const sessionManager =
      input.sessionManager ?? SessionManager?.inMemory?.() ?? { inMemory: true };

    const created = await createAgentSession({
      cwd: input.cwd,
      authStorage,
      modelRegistry,
      model,
      sessionManager,
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

    unsubscribe = session.subscribe((event) => {
      try {
        mapPiSessionEventToDispatch(event, input.options, state);
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
      state.error = 'Request aborted';
    }

    const finalText = (state.finalText || state.text).trim();
    const missingDelivery =
      input.requiredDeliveryTool &&
      !state.completedTools?.includes(input.requiredDeliveryTool);

    if (missingDelivery) {
      state.success = false;
      state.error =
        `任务尚未交付最终文件：必须调用 ${input.requiredDeliveryTool}。`;
      input.options?.onTaskProgress?.({
        phase: 'blocked',
        message: state.error,
        reasons: [state.error],
      });
    } else if (!input.abortController.signal.aborted) {
      if (finalText) input.options?.onText?.(finalText);
      input.options?.onTaskProgress?.({ phase: 'done' });
    }

    const verification = missingDelivery
      ? {
          passed: false,
          results: [{
            verifierId: 'file-delivery',
            passed: false,
            message: state.error!,
            retryable: true,
          }],
        }
      : { passed: true, results: [] };

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
        error: 'Request aborted',
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
