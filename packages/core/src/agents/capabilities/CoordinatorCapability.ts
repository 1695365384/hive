/**
 * CoordinatorCapability — 协调者能力
 *
 * 替代 ExecutionCapability，实现 Coordinator + Worker 模式。
 * Coordinator 只拥有 4 个工具（agent/task-stop/send-message/ask-user），
 * 所有实际工作委派给 Worker 子代理。
 *
 * 设计原则（指挥者-执行者模式）：
 * - Coordinator 分析意图、拆解任务、调度 Worker、汇总结果
 * - Worker 在独立 context 中执行，事件通过 hook 实时透传
 * - Coordinator 自身不直接操作文件或执行命令
 */

import type { AgentCapability, AgentContext } from '../core/types.js';
import type {
  ToolBeforeHookContext,
  ToolAfterHookContext,
  WorkflowPhaseHookContext,
  NotificationPushHookContext,
  NotificationType,
} from '../../hooks/types.js';
import type { SessionCapability } from './SessionCapability.js';
import type { Tool } from 'ai';
import { LLMRuntime } from '../runtime/LLMRuntime.js';
import { PromptTemplate } from '../prompts/PromptTemplate.js';
import { createAgentTool } from '../../tools/built-in/agent-tool.js';
import { createTaskStopTool } from '../../tools/built-in/task-stop-tool.js';
import { createSendMessageTool } from '../../tools/built-in/send-message-tool.js';
import { createRememberTool } from '../../tools/built-in/remember-tool.js';
import { createAskUserTool } from '../../tools/built-in/ask-user-tool.js';
import { createSkillInstallTool, setReloadSkillsCallback } from '../../tools/built-in/skill-install-tool.js';
import { createMcpInstallTool, setGetMcpManagerCallback } from '../../tools/built-in/mcp-install-tool.js';
import { TaskManager } from '../core/TaskManager.js';
import { createDynamicPromptBuilder } from '../pipeline/DynamicPromptBuilder.js';
import type { PromptBuildContext } from '../types/pipeline.js';
import { buildScheduleSummary } from './schedule-summary.js';
import { getModelPricing } from '../../providers/metadata/pricing.js';
import { fetchModelSpec } from '../../providers/metadata/index.js';
import { CompressionService } from '../../compression/CompressionService.js';
import type { PipelineCompressionResult } from '../../compression/CompressionService.js';
import { AdversarialHarness } from '../harness/AdversarialHarness.js';
import type { AdversarialConfig, HarnessResult } from '../harness/types.js';
import {
  TaskTraceCollector,
  createCompletionVerifierService,
  type CompletionVerifyResult,
} from '../completion/index.js';
import { stripDecorativeEmoji } from '../../utils/sanitize-output.js';
import {
  defaultTaskRouter,
  type TaskRouter,
  type WorkerSpawnInput,
} from '../../routing/index.js';
import { getAgentWorkerTypes, getSpawnedWorkerTypes } from '../completion/TaskTrace.js';
import { isOfficeDocumentPath } from '../../artifacts/artifact-detector.js';
import { isOfficeTask } from '../../routing/scenarios/office.scenario.js';
import { resolve as resolvePath } from 'node:path';
import { existsSync } from 'node:fs';

// ============================================
// 类型
// ============================================

/**
 * 统一分发选项
 */
export interface DispatchOptions {
  /** 会话 ID */
  chatId?: string;
  /** 工作目录 */
  cwd?: string;
  /** 最大轮次 */
  maxTurns?: number;
  /** 指定模型 */
  modelId?: string;
  /** 外部系统提示 */
  systemPrompt?: string;
  /** 阶段回调 */
  onPhase?: (phase: string, message: string) => void;
  /**
   * 路由决策回调（TaskRouter resolve 之后立刻触发）
   * 用于交互层展示「直接回答 / 委派 Worker / 能力说明」
   */
  onRoute?: (route: {
    mode: 'direct' | 'inquiry' | 'delegate' | 'hint';
    scenarioId?: string;
    workerType?: string;
    title?: string;
  }) => void;
  /** 文本输出回调 */
  onText?: (text: string) => void;
  /** 工具调用回调 */
  onTool?: (tool: string, input?: unknown) => void;
  /** 工具结果回调 */
  onToolResult?: (tool: string, result: unknown) => void;
  /** 推理回调 */
  onReasoning?: (text: string) => void;
  /** 外部取消信号 */
  abortSignal?: AbortSignal;
  /** 三元对抗质量控制配置（启用后 Thesis → Antithesis → Synthesis） */
  adversarial?: AdversarialConfig;
}

/**
 * 统一分发结果
 */
export interface DispatchResult {
  /** 最终文本输出（完整） */
  text: string;
  /** 最后一次工具调用后的文本（用于 channel 回复，不含叙述） */
  finalText?: string;
  /** 是否成功 */
  success: boolean;
  /** 总耗时（毫秒） */
  duration: number;
  /** 被调用的工具 */
  tools: string[];
  /** Token 使用量 */
  usage?: { input: number; output: number };
  /** Cost estimation (USD) */
  cost?: { input: number; output: number; total: number };
  /** 错误信息 */
  error?: string;
  /** 执行步骤详情（可选） */
  steps?: import('../runtime/types.js').StepResult[];
  /** 任务完成判定结果（可选） */
  verification?: CompletionVerifyResult;
}

// ============================================
// Implementation
// ============================================

/**
 * Coordinator 能力
 */
export class CoordinatorCapability implements AgentCapability {
  readonly name = 'coordinator';
  private context!: AgentContext;
  private runtime!: LLMRuntime;
  private promptTemplate!: PromptTemplate;
  private coordinatorTools: Record<string, Tool> = {};
  private taskManager = new TaskManager();
  private taskTrace = new TaskTraceCollector();
  private completionVerifier = createCompletionVerifierService();
  private taskRouter: TaskRouter = defaultTaskRouter;
  private workerStartHookId?: string;
  private workerToolResultHookId?: string;

  private static readonly DEFAULT_MAX_TURNS = 200;

  initialize(context: AgentContext): void {
    this.context = context;
    this.runtime = new LLMRuntime(context.providerManager);
    this.promptTemplate = new PromptTemplate();

    // 注册 MCP 管理器的工具注册/注销回调
    context.mcpManager.onToolRegistered = (toolName, tool) => {
      this.coordinatorTools[toolName] = tool;
    };
    context.mcpManager.onToolUnregistered = (toolName) => {
      delete this.coordinatorTools[toolName];
    };

    // 注册 skill-install 工具的回调：热重载注册表
    setReloadSkillsCallback(() => {
      context.skillRegistry.reload();
    });

    // 注册 mcp-install 工具的 MCP Manager 访问
    setGetMcpManagerCallback(() => context.mcpManager);

    // 构建工具集
    this.coordinatorTools = {
      // 原有权重
      agent: createAgentTool(context, this.taskManager),
      'task-stop': createTaskStopTool(this.taskManager),
      'send-message': createSendMessageTool(context),
      'ask-user': createAskUserTool(),
      remember: createRememberTool(),

      // 自愈/自安装工具
      'skill-install': createSkillInstallTool(),
      'mcp-install': createMcpInstallTool(),
    };

    // 记录 Worker spawn 轨迹（用于完成判定）
    if (this.workerStartHookId) {
      this.context.hookRegistry.off(this.workerStartHookId);
    }
    this.workerStartHookId = context.hookRegistry.on('worker:start', (ctx) => {
      if (ctx.workerType) {
        this.taskTrace.recordWorkerSpawn(ctx.workerType, ctx.description);
      }
      return { proceed: true };
    });

    if (this.workerToolResultHookId) {
      this.context.hookRegistry.off(this.workerToolResultHookId);
    }
    this.workerToolResultHookId = context.hookRegistry.on('worker:tool-result', (ctx) => {
      if (ctx.toolName) {
        this.taskTrace.recordArtifactsFromToolCall(ctx.toolName, ctx.input, ctx.output);
      }
      return { proceed: true };
    });
  }

  /**
   * 获取 TaskManager（供 ServerImpl 使用，用于 abort 所有 Worker）
   */
  getTaskManager(): TaskManager {
    return this.taskManager;
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * 执行任务
   */
  async run(task: string, options?: DispatchOptions): Promise<DispatchResult> {
    const startTime = Date.now();
    const sessionId = this.context.hookRegistry.getSessionId();

    // 空任务快速返回
    if (!task?.trim()) {
      return {
        text: '',
        success: false,
        duration: Date.now() - startTime,
        error: 'Task is empty',
        tools: [],
      };
    }

    let previousPhase: string | undefined;
    const abortController = new AbortController();
    this.taskTrace.reset(task);
    const previousDispatchTask = this.context.currentDispatchTask;
    this.context.currentDispatchTask = task;

    try {
      // 确保 session 已切换到正确的 chatId
      await this.ensureSession(options?.chatId);

      // 启动心跳
      const timeoutConfig = this.context.timeoutCap.getConfig();
      const combinedSignal = this.combineAbortSignals(abortController.signal, options?.abortSignal);

      this.context.timeoutCap.startHeartbeat(
        { interval: timeoutConfig.heartbeatInterval, stallTimeout: timeoutConfig.stallTimeout },
        abortController,
      );

      try {
        await this.emitNotification(sessionId, 'info', '任务开始',
          `开始执行: ${task.slice(0, 50)}${task.length > 50 ? '...' : ''}`);

        previousPhase = 'start';
        await this.emitPhase(sessionId, 'execute', '执行任务...', previousPhase, options);

        // 场景路由：确定性短路（TaskRouter 唯一入口）
        const routeDecision = this.taskRouter.resolve(task);
        if (routeDecision.action === 'inquiry') {
          const reply = stripDecorativeEmoji(routeDecision.reply);
          options?.onRoute?.({
            mode: 'inquiry',
            scenarioId: routeDecision.scenarioId,
            title: routeDecision.notificationTitle,
          });
          // 短路回复也走 onText，避免 UI 长时间 ColdStart 空白
          options?.onText?.(reply);
          const duration = Date.now() - startTime;
          return await this.finalizeTask(
            task, reply, reply, undefined, options, sessionId, duration, true,
            { passed: true, results: [] },
          );
        }

        if (routeDecision.action === 'delegate') {
          options?.onRoute?.({
            mode: 'delegate',
            scenarioId: routeDecision.scenarioId,
            workerType: routeDecision.spawn.type,
            title: routeDecision.notificationTitle,
          });
          await this.emitNotification(
            sessionId, 'info', routeDecision.notificationTitle, routeDecision.notificationBody,
          );
          const spawnResult = await this.autoSpawnWorker(routeDecision.spawn);
          const duration = Date.now() - startTime;
          if (spawnResult.success) {
            let resultText = stripDecorativeEmoji(spawnResult.output);
            this.flushOfficeArtifactsToUi();
            const verification = await this.completionVerifier.verify(this.taskTrace.getTrace());
            if (!verification.passed) {
              const reasons = verification.results
                .filter(r => !r.passed)
                .map(r => r.message)
                .join('; ');
              resultText = this.formatOfficeIncompleteMessage(task, reasons);
            }
            return await this.finalizeTask(
              task, resultText, resultText, undefined, options, sessionId, duration,
              verification.passed, verification,
            );
          }
          const errorText = stripDecorativeEmoji(
            `[Worker spawn failed: ${spawnResult.error}]`,
          );
          return await this.finalizeTask(
            task, errorText, errorText, undefined, options, sessionId, duration, false,
            {
              passed: false,
              results: [{ verifierId: 'worker-spawn', passed: false, message: spawnResult.error }],
            },
          );
        }

        // 无确定性委派：进入 Coordinator LLM（简单查询通常直接回答，不 spawn Worker）
        if (routeDecision.action === 'hint') {
          options?.onRoute?.({
            mode: 'hint',
            scenarioId: routeDecision.scenarioId,
          });
        } else {
          options?.onRoute?.({ mode: 'direct' });
        }

        // 构建 system prompt
        const systemPrompt = await this.buildSystemPrompt(task, options?.systemPrompt);

        // 加载历史消息 + 模型感知压缩
        const historyMessages = this.loadHistoryMessages();
        const compressedHistoryMessages = await this.compressHistoryIfNeeded(
          historyMessages,
          options?.modelId,
          systemPrompt,
        );

        // 执行 LLM 流式循环
        const { result, finalText, runtimeResult } = await this.executeStreamingLoop(
          task, systemPrompt, compressedHistoryMessages, options, combinedSignal, sessionId,
        );

        const duration = Date.now() - startTime;

        // 三元对抗质量控制
        const { text: qualityResult, harnessResult } = await this.runAdversarialHarness(
          task, result, options, sessionId,
        );

        const final = qualityResult ?? result;
        let isSuccess = (harnessResult?.success ?? runtimeResult?.success) ?? true;

        this.taskTrace.setResponseText(final);
        let resultText = stripDecorativeEmoji(final);
        this.flushOfficeArtifactsToUi();
        let verification = await this.completionVerifier.verify(this.taskTrace.getTrace());
        if (!verification.passed) {
          isSuccess = false;
        }

        // 场景任务未派正确 Worker 时自动补救
        const recoveryDecision = this.taskRouter.resolve(task);
        if (
          !verification.passed
          && recoveryDecision.action === 'delegate'
        ) {
          const routed = [
            ...getAgentWorkerTypes(this.taskTrace.getTrace()),
            ...getSpawnedWorkerTypes(this.taskTrace.getTrace()),
          ];
          const expectedType = recoveryDecision.spawn.type;
          if (!routed.includes(expectedType)) {
            const recovered = await this.autoSpawnWorker(recoveryDecision.spawn);
            if (recovered.success) {
              resultText = stripDecorativeEmoji(recovered.output);
              this.taskTrace.setResponseText(recovered.output);
              this.flushOfficeArtifactsToUi();
              verification = await this.completionVerifier.verify(this.taskTrace.getTrace());
              isSuccess = verification.passed;
            }
          }
        }

        if (!verification.passed) {
          const reasons = verification.results
            .filter(r => !r.passed)
            .map(r => r.message)
            .join('; ');
          resultText = this.formatOfficeIncompleteMessage(task, reasons, final);
        }

        // 收尾：通知 + 持久化 + 返回
        return await this.finalizeTask(
          task, resultText, finalText, runtimeResult, options, sessionId, duration, isSuccess, verification,
        );
      } finally {
        this.context.timeoutCap.stopHeartbeat();
        this.taskManager.abortAll();
      }
    } catch (error) {
      abortController.abort();
      this.taskManager.abortAll();
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.emitPhase(sessionId, 'error', errorMsg, previousPhase, options);
      await this.emitNotification(sessionId, 'error', '执行错误', errorMsg, { error: true });

      return {
        text: '',
        tools: [],
        success: false,
        error: errorMsg,
        duration: Date.now() - startTime,
      };
    } finally {
      this.context.currentDispatchTask = previousDispatchTask;
    }
  }

  /** 场景委派：直接派 Worker（spawn 失败显式返回，不静默 fallback） */
  private async autoSpawnWorker(
    spawn: WorkerSpawnInput,
  ): Promise<{ success: true; output: string } | { success: false; error: string }> {
    const agentTool = this.coordinatorTools.agent as {
      execute?: (input: unknown) => Promise<string>;
    };
    if (!agentTool?.execute) {
      return { success: false, error: 'Agent tool not available' };
    }

    try {
      this.taskTrace.recordToolCall('agent', spawn);
      const output = await agentTool.execute(spawn);
      this.taskTrace.recordToolResult('agent', output);
      if (output.startsWith('Status: FAILED')) {
        return { success: false, error: output };
      }
      return { success: true, output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  // ============================================
  // Streaming Execution Loop
  // ============================================

  /** 执行 LLM 流式循环，返回累积文本和运行时结果 */
  private async executeStreamingLoop(
    task: string,
    systemPrompt: string,
    historyMessages: import('../../session/types.js').Message[],
    options: DispatchOptions | undefined,
    combinedSignal: AbortSignal | undefined,
    sessionId: string,
  ): Promise<{
    result: string;
    finalText: string;
    runtimeResult: import('../runtime/types.js').RuntimeResult;
  }> {
    let text = '';
    let lastToolResultIndex = -1;

    const baseMessages = historyMessages.length > 0
      ? [...historyMessages.map(m => ({ role: m.role as string, content: m.content as string })), { role: 'user' as const, content: task }]
      : [];

    const { events, result: resultPromise } = this.runtime.stream({
      system: systemPrompt,
      messages: baseMessages.length > 0 ? baseMessages as any : undefined,
      prompt: baseMessages.length === 0 ? task : undefined,
      tools: this.coordinatorTools,
      maxSteps: options?.maxTurns ?? CoordinatorCapability.DEFAULT_MAX_TURNS,
      model: options?.modelId,
      abortSignal: combinedSignal,
    });

    for await (const event of events) {
      switch (event.type) {
        case 'text-delta': {
          const cleaned = stripDecorativeEmoji(event.text, { trim: false });
          text += cleaned;
          options?.onText?.(cleaned);
          break;
        }
        case 'tool-call':
          this.taskTrace.recordToolCall(event.toolName, event.input);
          this.emitToolBefore(sessionId, event.toolName, event.input).catch(
            (err) => this.context.hookRegistry.emit('notification:push', {
              sessionId, type: 'warning', title: 'Hook Error',
              message: `tool:before hook failed: ${err instanceof Error ? err.message : String(err)}`,
              timestamp: new Date(),
            }),
          );
          options?.onTool?.(event.toolName, event.input);
          break;
        case 'tool-result':
          lastToolResultIndex = text.length;
          this.taskTrace.recordToolResult(event.toolName, event.output);
          this.emitToolAfter(sessionId, event.toolName, event.output).catch(
            (err) => this.context.hookRegistry.emit('notification:push', {
              sessionId, type: 'warning', title: 'Hook Error',
              message: `tool:after hook failed: ${err instanceof Error ? err.message : String(err)}`,
              timestamp: new Date(),
            }),
          );
          options?.onToolResult?.(event.toolName, event.output);
          this.context.timeoutCap.updateActivity();
          break;
        case 'reasoning':
          // Coordinator 的思考不发给前端 — 用户只需看到 Worker 的思考
          break;
      }
    }

    const runtimeResult = await resultPromise;
    const finalText = lastToolResultIndex >= 0 && text.length > lastToolResultIndex
      ? text.slice(lastToolResultIndex).trim()
      : text.trim();

    return { result: text, finalText, runtimeResult };
  }

  // ============================================
  // Adversarial Harness
  // ============================================

  /** 执行三元对抗质量控制（Thesis → Antithesis → Synthesis），失败时优雅降级 */
  private async runAdversarialHarness(
    task: string,
    result: string,
    options: DispatchOptions | undefined,
    sessionId: string,
  ): Promise<{ text: string | null; harnessResult: HarnessResult | null }> {
    const adversarialCfg = options?.adversarial;
    if (!adversarialCfg || !result) return { text: null, harnessResult: null };

    try {
      await this.emitPhase(sessionId, 'verify', 'Starting adversarial quality review (critic → arbiter)...', 'execute', options);
      const harness = new AdversarialHarness(this.context.providerManager);
      const harnessResult = await harness.run(task, result, adversarialCfg, {
        onRoundStart: (round) => {
          this.emitPhase(sessionId, 'verify', `Adversarial round ${round}: critic reviewing...`, 'verify', options)
            .catch(() => {});
        },
        onRoundComplete: (record) => {
          const q = record.synthesis.quality;
          this.emitPhase(sessionId, 'verify',
            `Round ${record.round} complete — quality: ${(q.overall * 100).toFixed(0)}% ${q.passed ? '✓' : '✗'}`,
            'verify', options).catch(() => {});
        },
      });

      if (harnessResult.success && harnessResult.text) {
        return { text: harnessResult.text, harnessResult };
      }
      return { text: null, harnessResult };
    } catch (harnessError) {
      console.warn('[coordinator] Adversarial harness failed, falling back to original output:',
        harnessError instanceof Error ? harnessError.message : String(harnessError));
      this.emitPhase(sessionId, 'verify',
        'Adversarial review failed, using original output',
        'verify', options).catch(() => {});
      return { text: null, harnessResult: null };
    }
  }

  // ============================================
  // Task Finalization
  // ============================================

  /**
   * Push Office docs (.pptx/.docx/.xlsx) into Desktop chat before we claim completion.
   * Screenshots alone are ignored — Preview unlocks from the Office file itself.
   */
  private flushOfficeArtifactsToUi(): void {
    const deliver = this.context.onDeliverArtifacts;
    if (!deliver) return;

    const paths = this.taskTrace.getTrace().artifacts
      .filter(isOfficeDocumentPath)
      .map((p) => resolvePath(p))
      .filter((p) => existsSync(p));

    if (paths.length === 0) return;
    deliver(paths);
  }

  /** User-facing failure copy — never keep LLM “screenshots shown / file path” fibs. */
  private formatOfficeIncompleteMessage(task: string, reasons: string, priorText?: string): string {
    if (isOfficeTask(task)) {
      return stripDecorativeEmoji(
        [
          '文档还没有投递到对话，因此无法预览。',
          '请对最终的 .pptx / .docx / .xlsx 调用 send-file（不要只写磁盘路径，也不要只发截图冒充交付）。',
          `原因：${reasons}`,
        ].join('\n'),
      );
    }
    const base = priorText?.trim() ? `${stripDecorativeEmoji(priorText)}\n\n` : '';
    return stripDecorativeEmoji(`${base}[Task incomplete: ${reasons}]`);
  }

  /** 收尾：通知完成、持久化会话、保存记忆、计算成本、返回结果 */
  private async finalizeTask(
    task: string,
    result: string,
    finalText: string,
    runtimeResult: import('../runtime/types.js').RuntimeResult | undefined,
    options: DispatchOptions | undefined,
    sessionId: string,
    duration: number,
    success: boolean,
    verification?: CompletionVerifyResult,
  ): Promise<DispatchResult> {
    await this.emitPhase(sessionId, 'complete', success ? '任务完成' : '任务失败', 'execute', options);

    await this.emitNotification(
      sessionId,
      success ? 'success' : 'error',
      success ? '任务完成' : '任务失败',
      success ? '执行成功完成' : `执行失败: ${runtimeResult?.error || '未知错误'}`,
      { duration },
    );

    // 持久化对话到 session
    if (success && result) {
      await this.persistSession(task, result);
    }

    // 自动保存对话摘要到记忆文件
    if (success && result && this.context.currentUserId && this.context.fileMemory) {
      try {
        const summary = [
          `**User**: ${task.slice(0, 200)}${task.length > 200 ? '…' : ''}`,
          `**Assistant**: ${result.slice(0, 500)}${result.length > 500 ? '…' : ''}`,
        ].join('\n\n');
        await this.context.fileMemory.appendMemory(this.context.currentUserId, summary);
      } catch {
        // 记忆保存失败时静默忽略
      }
    }

    const modelId = this.context.getActiveProvider()?.model;

    return {
      text: result,
      finalText: finalText ? stripDecorativeEmoji(finalText) : finalText,
      tools: runtimeResult?.tools ?? [],
      success,
      error: runtimeResult?.error,
      usage: runtimeResult?.usage
        ? { input: runtimeResult.usage.promptTokens, output: runtimeResult.usage.completionTokens }
        : undefined,
      cost: this.calculateCost(
        runtimeResult?.usage
          ? { input: runtimeResult.usage.promptTokens, output: runtimeResult.usage.completionTokens }
          : undefined,
        modelId,
      ),
      steps: runtimeResult?.steps,
      duration,
      verification,
    };
  }

  // ============================================
  // System Prompt Building
  // ============================================

  /**
   * 构建 system prompt
   *
   * 使用 coordinator.md 模板，注入 schedule/tools sections。
   */
  private async buildSystemPrompt(
    task: string,
    externalSystemPrompt?: string,
  ): Promise<string> {
    let basePrompt: string;
    if (externalSystemPrompt) {
      basePrompt = externalSystemPrompt;
    } else {
      const isChineseTask = /[\u4e00-\u9fa5]/.test(task);
      const languageInstruction = isChineseTask
        ? '【重要】你必须用中文回复，与用户的语言保持一致。'
        : "CRITICAL: You must respond in English, matching the user's language.";

      basePrompt = this.promptTemplate.render('coordinator', { task });
    }

    // 通过 DynamicPromptBuilder 注入 schedule/tools
    const builder = createDynamicPromptBuilder();
    const scheduleSummary = await buildScheduleSummary(this.context);
    const toolDescriptions = Object.entries(this.coordinatorTools).map(([name, tool]) => ({
      name,
      description: tool.description ?? '',
    }));

    const extraSections = builder.buildPrompt({
      task: '',
      priorResults: [],
      agentType: 'general',
      skipBaseTemplate: true,
      environmentContext: this.context.environmentContext,
      scheduleSummary,
      toolDescriptions,
    } satisfies PromptBuildContext);

    const parts: string[] = [];

    // 注入用户记忆（previous knowledge）
    const userId = this.context.currentUserId;
    const fileMemory = this.context.fileMemory;
    if (userId && fileMemory) {
      try {
        const memoryContent = await fileMemory.readMemory(userId);
        if (memoryContent.trim()) {
          parts.push(`[Previous knowledge about the user]\n${memoryContent.trim()}\n[/Previous knowledge]`);
        }
      } catch {
        // 读取记忆失败时静默忽略，不影响主流程
      }
    }

    if (basePrompt.trim()) {
      parts.push(basePrompt);
    }

    if (extraSections.trim()) {
      parts.push(extraSections);
    }

    const routingDirective = this.taskRouter.getRoutingHint(task);
    if (routingDirective) {
      parts.push(routingDirective);
    }

    for (const blurb of this.taskRouter.getCoordinatorBlurbs(task)) {
      parts.push(blurb);
    }

    const mcpToolNames = Object.keys(this.context.mcpManager?.getAllTools?.() ?? {});
    if (mcpToolNames.some(name => name.toLowerCase().includes('office'))) {
      parts.push(`[MCP Tools] officecli MCP tools registered: ${mcpToolNames.filter(n => n.toLowerCase().includes('office')).join(', ')}`);
    }

    return parts.join('\n\n');
  }

  // ============================================
  // Session Management
  // ============================================

  private async ensureSession(chatId: string | undefined): Promise<void> {
    if (!chatId) return;

    const sessionCap = this.getSessionCap();
    if (!sessionCap) return;

    if (sessionCap.getCurrentSessionId() === chatId) return;

    const loaded = await sessionCap.loadSession(chatId);
    if (!loaded) {
      await sessionCap.createSession({ id: chatId });
    }
  }

  private loadHistoryMessages() {
    const sessionCap = this.getSessionCap();
    return sessionCap?.getMessages() ?? [];
  }

  private async persistSession(task: string, responseText: string): Promise<void> {
    const sessionCap = this.getSessionCap();
    if (!sessionCap) return;

    await sessionCap.addUserMessage(task);
    if (responseText) {
      await sessionCap.addAssistantMessage(responseText);
    }
  }

  /**
   * 动态模型感知的历史消息压缩
   *
   * 根据当前模型（或 options.modelId 指定）的 contextWindow 计算 budget，
   * 触发 L0→L1→L2→L3 分级压缩管道，达标即止。
   */
  private async compressHistoryIfNeeded(
    messages: import('../../session/types.js').Message[],
    modelIdOverride: string | undefined,
    systemPrompt: string,
  ): Promise<import('../../session/types.js').Message[]> {
    if (messages.length === 0) return messages;

    const activeProvider = this.context.getActiveProvider();
    if (!activeProvider?.model) return messages;

    // 组装 system prompt Token 估算（粗略：中文字符 * 1.3 + ASCII / 4）
    const systemPromptSize = Math.ceil(systemPrompt.length * 0.35);

    // 工具 schemas 估算（4 个工具 * ~300 tokens each）
    const toolSchemaSize = 1200;

    // 默认 contextWindow（safe fallback）
    let contextWindow = 128_000;

    let maxOutputTokens = 0;
    let resolvedModelId = modelIdOverride ?? activeProvider.model;

    try {
      const spec = await fetchModelSpec(activeProvider.id, resolvedModelId);
      if (spec?.contextWindow) {
        contextWindow = spec.contextWindow;
      }
      if (spec?.maxOutputTokens) {
        maxOutputTokens = spec.maxOutputTokens;
      }
      // 如果 spec 有 family 信息也可以用来细化模型选择
      if (spec?.family) {
        resolvedModelId = spec.family;
      }
    } catch {
      // fallback to default
    }

    const compressionService = new CompressionService({
      compression: {
        contextWindowSize: contextWindow,
        threshold: 0, // 使用 thresholdPercentage 动态计算
        thresholdPercentage: 0.8,
        systemPromptTokens: systemPromptSize,
        toolSchemaTokens: toolSchemaSize,
        maxOutputTokens, // 从模型 spec 获取精确值
        strategy: 'hybrid',
      },
      modelId: resolvedModelId, // 传递给 token counter 实现模型感知计数
      autoCompress: true,
    });

    // 初始化 token 计数器（后台加载 tiktoken WASM）
    await compressionService.initialize();

    try {
      const pipelineResult: PipelineCompressionResult = await compressionService.compressPipeline(messages);

      if (pipelineResult.totalTokensSaved > 0) {
        const phasesSummary = pipelineResult.phases
          .filter(p => p.triggered)
          .map(p => `${p.strategy}=${p.tokensSaved}tok`)
          .join(', ');

        this.emitNotification(
          this.context.hookRegistry.getSessionId(),
          'info',
          '上下文压缩',
          `模型窗口=${contextWindow}, 节省=${pipelineResult.totalTokensSaved}tok [${phasesSummary}]`,
        ).catch(() => {});
      }

      return pipelineResult.messages;
    } catch {
      // 压缩失败时优雅降级，使用原始消息
      return messages;
    }
  }

  private getSessionCap(): SessionCapability | null {
    return this.context.getSessionCap?.() ?? null;
  }

  // ============================================
  // Cost Calculation
  // ============================================

  private calculateCost(
    usage: { input: number; output: number } | undefined,
    modelId: string | undefined,
  ): { input: number; output: number; total: number } | undefined {
    if (!usage || !modelId) {
      return undefined;
    }
    const pricing = getModelPricing(modelId);
    if (!pricing) {
      return undefined;
    }
    const inputCost = (usage.input / 1_000_000) * pricing.input;
    const outputCost = (usage.output / 1_000_000) * pricing.output;
    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
    };
  }

  // ============================================
  // Hook Emitters
  // ============================================

  private async emitNotification(
    sessionId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const hookContext: NotificationPushHookContext = {
      sessionId,
      type,
      title,
      message,
      timestamp: new Date(),
      metadata,
    };
    await this.context.hookRegistry.emit('notification:push', hookContext);
  }

  private async emitPhase(
    sessionId: string,
    phase: string,
    message: string,
    previousPhase: string | undefined,
    options: DispatchOptions | undefined,
  ): Promise<void> {
    const hookContext: WorkflowPhaseHookContext = {
      sessionId,
      phase,
      message,
      previousPhase,
      timestamp: new Date(),
    };
    await this.context.hookRegistry.emit('workflow:phase', hookContext);
    options?.onPhase?.(phase, message);
  }

  private async emitToolBefore(
    sessionId: string,
    toolName: string,
    input: unknown,
  ): Promise<void> {
    const hookContext: ToolBeforeHookContext = {
      sessionId,
      toolName,
      input: input as Record<string, unknown> ?? {},
      timestamp: new Date(),
    };
    await this.context.hookRegistry.emit('tool:before', hookContext);
  }

  private async emitToolAfter(
    sessionId: string,
    toolName: string,
    output: unknown,
  ): Promise<void> {
    const hookContext: ToolAfterHookContext = {
      sessionId,
      toolName,
      input: {},
      output,
      success: true,
      duration: 0,
      timestamp: new Date(),
    };
    await this.context.hookRegistry.emit('tool:after', hookContext);
  }

  // ============================================
  // Utilities
  // ============================================

  private combineAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
    const activeSignals = signals.filter((signal): signal is AbortSignal => signal !== undefined);
    if (activeSignals.length === 0) return undefined;
    if (activeSignals.length === 1) return activeSignals[0];

    return AbortSignal.any(activeSignals);
  }
}
