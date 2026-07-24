/**
 * AgentLoop — 统一 Agent 执行引擎
 *
 * 执行核：@oh-my-pi/pi-coding-agent createAgentSession()（唯一路径）。
 */

import type { AgentContext, AgentCapability } from '../types/core.js';
import type { DispatchOptions, DispatchResult } from '../types/dispatch.js';
import { PromptTemplate } from '../prompts/PromptTemplate.js';
import { TaskManager } from './TaskManager.js';
import {
  createSessionFsContext,
  runWithSessionFs,
} from '../../workspace/session-fs.js';
import { runWithPiAgentSession } from './PiAgentSessionAdapter.js';
import {
  bridgeMcpToolsToCustomTools,
  buildHiveCustomTools,
} from './hive-tool-bridge.js';

/** Prefix explaining pi built-in tool names. */
const PI_TOOL_NAME_PREFIX = `## Tool names (pi kernel)

Built-in tools: \`read\`, \`edit\`, \`write\`, \`bash\`, \`glob\`, \`grep\`, \`web_search\`, \`task\`.
Deliver files to the user with \`send-file\`.
Hive \`file\` read/write is replaced by \`read\` / \`edit\` / \`write\`.
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

function isPptTask(task: string): boolean {
  return /\b(?:ppt|pptx|powerpoint|presentation)\b|幻灯片|演示文稿|汇报材料/i.test(task);
}

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
            },
            abortController,
          );

          this.context.currentDispatchTask = task;

          try {
            const systemPrompt = await this.buildSystemPrompt(task, options);
            const hiveCustomTools = [
              ...buildHiveCustomTools(this.context),
              ...bridgeMcpToolsToCustomTools(this.context.mcpManager.getAllTools()),
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
              requiredDeliveryTool: isPptTask(task) ? 'send-file' : undefined,
            });

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
   * 构建系统提示词：agent-system.md + pi 工具名前缀 + 命中/强制技能
   */
  private async buildSystemPrompt(task: string, options?: DispatchOptions): Promise<string> {
    const template = this.promptTemplate.render('agent-system', {});
    const parts: string[] = [];

    if (options?.systemPrompt) {
      parts.push(options.systemPrompt, '---');
    }

    parts.push(PI_TOOL_NAME_PREFIX, template);

    const activeSkill = this.resolveActiveSkill(task);
    if (activeSkill) {
      options?.onSkill?.({
        name: activeSkill.metadata.name,
        description: activeSkill.metadata.description,
      });
      parts.push(
        '---',
        this.context.skillRegistry.generateSkillInstruction(activeSkill),
      );
      if (activeSkill.metadata.name === 'dashi-ppt' && isPptTask(task)) {
        parts.push('---', HIVE_DESKTOP_PPT_DELIVERY);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * PPT 任务强制走 dashi-ppt（若已安装）；其它任务走自动匹配。
   */
  private resolveActiveSkill(task: string) {
    const registry = this.context.skillRegistry;
    if (isPptTask(task)) {
      const dashi = registry.get('dashi-ppt');
      if (dashi) return dashi;
    }

    return registry.match(task)?.skill ?? null;
  }
}
