/**
 * AgentLoop — 统一 Agent 执行引擎
 *
 * 执行核：@oh-my-pi/pi-coding-agent createAgentSession()（唯一路径）。
 */

import type { AgentContext, AgentCapability } from '../types/core.js';
import type { PersistentMemory } from '../../memory/types.js';
import type { DispatchOptions, DispatchResult } from '../types/dispatch.js';
import { PromptTemplate } from '../prompts/PromptTemplate.js';
import { TaskManager } from './TaskManager.js';
import {
  createSessionFsContext,
  runWithSessionFs,
} from '../../workspace/session-fs.js';
import {
  HIVE_DEFAULT_MAX_TURNS,
  runWithPiAgentSession,
  type HiveHistoryMessage,
} from './PiAgentSessionAdapter.js';
import {
  bridgeMcpToolsToCustomTools,
  buildHiveCustomTools,
} from './hive-tool-bridge.js';
import { planAttempt, type AttemptPlan } from '../graph/index.js';

/** Prefix explaining pi built-in + Hive custom tool names. */
const PI_TOOL_NAME_PREFIX = `## Tool names (pi kernel)

Built-in: \`read\`, \`edit\`, \`write\`, \`bash\`, \`glob\`, \`grep\`, \`web_search\`, \`task\`.
Hive extensions: \`send-file\`, \`remember\`, \`env\`, \`ask-user\`, \`web-fetch\`.

Do NOT call legacy names \`file\` or \`web-search\` — they are not on the live path.
Deliver files to the user with \`send-file\` only.
`;

const HIVE_DESKTOP_PPT_DELIVERY = `## Hive Desktop PPT delivery

For a user request to create a PPT/presentation, the final deliverable is an editable \`.pptx\` file in Hive Desktop.

- Use dashi-ppt to render and validate the HTML deck first.
- Export the deck to a real \`.pptx\` file with the skill's export command.
- Call \`send-file\` with that \`.pptx\` before claiming completion.
- A localhost preview URL, an \`index.html\`, or a prose summary alone is not a completed delivery.
- Keep operational narration such as “让我检查” or “现在开始” out of the final response. The activity timeline already shows concise progress.
- The final response should be short: state that the file is ready and identify the delivered filename.
`;

/** Max chars of FileMemory injected into the system prompt. */
export const HIVE_MEMORY_PROMPT_MAX_CHARS = 4000;

/** Max prior messages fed into pi / system prompt. */
export const HIVE_HISTORY_MAX_MESSAGES = 40;

/**
 * Agent 自驱动执行引擎
 *
 * 实现 AgentCapability 接口，兼容 DI 容器的 initializeAll() 流程：
 *   1. new AgentLoop() — 空构造
 *   2. registerCapability(agentLoop)
 *   3. initializeAll() → agentLoop.initialize(context)
 */
export class AgentLoop implements AgentCapability {
  readonly name = 'agent-loop';

  private context!: AgentContext;
  private promptTemplate!: PromptTemplate;
  private taskManager = new TaskManager();

  initialize(context: AgentContext): void {
    this.context = context;
    this.promptTemplate = new PromptTemplate();
  }

  /**
   * 获取 TaskManager（供 ServerImpl 调用来 abort 所有 Worker）
   */
  getTaskManager(): TaskManager {
    return this.taskManager;
  }

  /**
   * 执行任务 — 唯一路径：pi createAgentSession
   */
  async run(task: string, options?: DispatchOptions): Promise<DispatchResult> {
    const startTime = Date.now();
    const sessionId = this.context.hookRegistry.getSessionId();

    if (!task?.trim()) {
      return {
        text: '',
        success: false,
        duration: Date.now() - startTime,
        error: 'Task is empty',
        tools: [],
      };
    }

    const abortController = new AbortController();
    if (options?.abortSignal) {
      if (options.abortSignal.aborted) {
        abortController.abort();
      } else {
        options.abortSignal.addEventListener(
          'abort',
          () => abortController.abort(),
          { once: true },
        );
      }
    }

    try {
      const sessionKey = options?.chatId || sessionId || 'default';
      const sessionFs = createSessionFsContext(sessionKey, options?.cwd);

      return await runWithSessionFs(sessionFs, async () => {
        try {
          const timeoutConfig = this.context.timeoutCap.getConfig();
          this.context.timeoutCap.startHeartbeat(
            {
              interval: timeoutConfig.heartbeatInterval,
              stallTimeout: timeoutConfig.stallTimeout,
              action: 'abort',
            },
            abortController,
          );

          this.context.currentDispatchTask = task;

          try {
            // Graph layer: match → AttemptPlan (TaskRouter is the match impl).
            const attempt = planAttempt(task);
            this.emitRouteFromAttempt(attempt, options);

            const historyMessages = await this.resolveHistoryMessages(options);
            const systemPrompt = await this.buildSystemPrompt(
              task,
              options,
              historyMessages,
              attempt,
            );
            const hiveCustomTools = [
              ...buildHiveCustomTools(this.context),
              ...bridgeMcpToolsToCustomTools(
                this.context.mcpManager.getAllTools() as Record<string, any>,
              ),
            ];

            const result = await runWithPiAgentSession({
              task,
              options,
              systemPrompt,
              cwd: sessionFs.workspaceDir,
              providerManager: this.context.providerManager,
              hiveCustomTools,
              abortController,
              context: this.context,
              historyMessages,
              maxTurns: options?.maxTurns ?? HIVE_DEFAULT_MAX_TURNS,
              requiredDeliveryTool: attempt.requiredDeliveryTool,
              onActivity: () => {
                this.context.timeoutCap.updateActivity();
              },
            });

            await this.persistTurn(task, result, options);

            return {
              ...result,
              duration: result.duration || Date.now() - startTime,
            };
          } finally {
            this.context.timeoutCap.stopHeartbeat();
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));

          if (err.name === 'AbortError') {
            return {
              text: '',
              success: false,
              duration: Date.now() - startTime,
              error: 'Request aborted',
              tools: [],
            };
          }

          return {
            text: '',
            success: false,
            duration: Date.now() - startTime,
            error: err.message,
            tools: [],
          };
        }
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        text: '',
        success: false,
        duration: Date.now() - startTime,
        error: err.message,
        tools: [],
      };
    } finally {
      abortController.abort();
    }
  }

  /**
   * Load / create Hive session for chatId and return prior turns.
   */
  private async resolveHistoryMessages(
    options?: DispatchOptions,
  ): Promise<HiveHistoryMessage[]> {
    const sessionCap = this.context.getSessionCap?.();
    if (!sessionCap) return [];

    const chatId = options?.chatId;
    if (chatId) {
      try {
        const existing = await sessionCap.loadSession(chatId);
        if (!existing) {
          await sessionCap.createSession({ id: chatId });
        }
      } catch {
        // SessionCapability may be uninitialized in unit tests
        return [];
      }
    }

    const messages = sessionCap.getMessages?.() ?? [];
    return messages
      .slice(-HIVE_HISTORY_MAX_MESSAGES)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
      }))
      .filter((m) => m.content.trim().length > 0);
  }

  /**
   * Persist this turn so the next dispatch can reload Hive history.
   */
  private async persistTurn(
    task: string,
    result: DispatchResult,
    options?: DispatchOptions,
  ): Promise<void> {
    const sessionCap = this.context.getSessionCap?.();
    if (!sessionCap?.addUserMessage) return;

    try {
      if (options?.chatId && !sessionCap.getCurrentSession?.()) {
        const existing = await sessionCap.loadSession(options.chatId);
        if (!existing) {
          await sessionCap.createSession({ id: options.chatId });
        }
      }
      await sessionCap.addUserMessage(task);
      if (result.text?.trim()) {
        await sessionCap.addAssistantMessage(result.text);
      }
    } catch {
      // Persistence must not fail the user-facing turn
    }
  }

  /**
   * 构建系统提示词：agent-system.md + pi 工具名前缀 + Graph blurbs + 命中/强制技能
   * + memory / history（Context 层）
   */
  private async buildSystemPrompt(
    task: string,
    options?: DispatchOptions,
    historyMessages?: HiveHistoryMessage[],
    attempt?: AttemptPlan,
  ): Promise<string> {
    const plan = attempt ?? planAttempt(task);
    const template = this.promptTemplate.render('agent-system', {});
    const parts: string[] = [];

    if (options?.systemPrompt) {
      parts.push(options.systemPrompt, '---');
    }

    parts.push(PI_TOOL_NAME_PREFIX, template);

    if (plan.blurbs.length > 0) {
      parts.push('---', '## Scenario guidance (Graph)', ...plan.blurbs);
    }

    const memoryBlock = await this.buildMemoryPromptBlock(task);
    if (memoryBlock) {
      parts.push('---', memoryBlock);
    }

    const historyBlock = formatHistoryForPrompt(historyMessages);
    if (historyBlock) {
      parts.push('---', historyBlock);
    }

    const activeSkill = this.resolveActiveSkill(task, plan);
    if (activeSkill) {
      options?.onSkill?.({
        name: activeSkill.metadata.name,
        description: activeSkill.metadata.description,
      });
      parts.push(
        '---',
        this.context.skillRegistry.generateSkillInstruction(activeSkill),
      );
      if (
        activeSkill.metadata.name === 'dashi-ppt' &&
        plan.requiredDeliveryTool === 'send-file'
      ) {
        parts.push('---', HIVE_DESKTOP_PPT_DELIVERY);
      }
    }

    return parts.join('\n\n');
  }

  private async buildMemoryPromptBlock(task?: string): Promise<string> {
    const fileMemory = this.context.fileMemory;
    const userId = this.context.currentUserId;
    if (!fileMemory || !userId) return '';

    try {
      // MnemopiMemory supports query-aware recall as a 2nd arg; FileMemory ignores it.
      const raw = await (
        fileMemory as PersistentMemory & {
          readMemory: (userId: string, recallQuery?: string) => Promise<string>;
        }
      ).readMemory(userId, task);
      return formatMemoryForPrompt(raw);
    } catch {
      return '';
    }
  }

  /**
   * PPT delivery tasks force dashi-ppt (when installed); others use auto-match.
   * Delivery intent comes from GoalGraph AttemptPlan, not a local regex.
   */
  private resolveActiveSkill(task: string, attempt?: AttemptPlan) {
    const registry = this.context.skillRegistry;
    const plan = attempt ?? planAttempt(task);
    if (plan.requiredDeliveryTool === 'send-file') {
      const dashi = registry.get('dashi-ppt');
      if (dashi) return dashi;
    }

    return registry.match(task)?.skill ?? null;
  }

  /** Surface Graph match to the channel for UX (direct / scenario). */
  private emitRouteFromAttempt(
    attempt: AttemptPlan,
    options?: DispatchOptions,
  ): void {
    if (!options?.onRoute) return;
    if (attempt.scenarioId) {
      options.onRoute({
        mode: 'hint',
        scenarioId: attempt.scenarioId,
        title: attempt.scenarioId,
      });
      return;
    }
    options.onRoute({ mode: 'direct' });
  }
}

/** Format prior turns for system-prompt injection (also used by tests). */
export function formatHistoryForPrompt(
  history: HiveHistoryMessage[] | undefined,
): string {
  if (!history?.length) return '';
  const lines: string[] = [
    '## Conversation history',
    'Prior turns in this Hive session (most recent last):',
  ];
  for (const msg of history) {
    const label = msg.role === 'assistant' ? 'Assistant' : 'User';
    lines.push(`${label}: ${msg.content}`);
  }
  return lines.join('\n');
}

/** Format FileMemory contents for system-prompt injection (also used by tests). */
export function formatMemoryForPrompt(
  raw: string,
  maxChars = HIVE_MEMORY_PROMPT_MAX_CHARS,
): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const clipped =
    trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}\n…` : trimmed;
  return `## Persistent memory\n\n${clipped}`;
}
