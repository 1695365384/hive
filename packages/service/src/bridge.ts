/**
 * stdio 桥接
 *
 * 监听 stdin，解析请求，通过 stdout 返回流式响应
 */

import * as readline from 'readline';
import type { Request, StreamEvent } from './protocol.js';
import {
  createEvent,
  thinkingEvent,
  chunkEvent,
  toolUseEvent,
  progressEvent,
  errorEvent,
  doneEvent,
} from './protocol.js';
import type { ChatPayload, ExplorePayload, PlanPayload, WorkflowPayload } from './protocol.js';
import { getAgentManager } from './agent-manager.js';
import type { Agent, HookResult, ThoroughnessLevel } from '@aiclaw/core';
import type {
  AgentThinkingHookContext,
  TaskProgressHookContext,
  ToolBeforeHookContext,
} from './types.js';

/**
 * 请求处理器类型
 */
export type RequestHandler = (
  request: Request,
  sender: EventSender
) => Promise<void>;

/**
 * 事件发送器
 */
export interface EventSender {
  /** 发送事件 */
  send: (event: StreamEvent) => void;
  /** 发送思考事件 */
  thinking: (content: string) => void;
  /** 发送内容块事件 */
  chunk: (content: string) => void;
  /** 发送工具调用事件 */
  toolUse: (toolName: string, toolInput: unknown) => void;
  /** 发送进度事件 */
  progress: (current: number, total: number, message: string) => void;
  /** 发送错误事件 */
  error: (error: string) => void;
  /** 发送完成事件 */
  done: () => void;
}

/**
 * 创建事件发送器
 */
function createSender(requestId: string): EventSender {
  const send = (event: StreamEvent) => {
    // 输出 JSON 行
    console.log(JSON.stringify(event));
  };

  return {
    send,
    thinking: (content: string) => send(thinkingEvent(requestId, content)),
    chunk: (content: string) => send(chunkEvent(requestId, content)),
    toolUse: (toolName: string, toolInput: unknown) =>
      send(toolUseEvent(requestId, toolName, toolInput)),
    progress: (current: number, total: number, message: string) =>
      send(progressEvent(requestId, current, total, message)),
    error: (error: string) => send(errorEvent(requestId, error)),
    done: () => send(doneEvent(requestId)),
  };
}

/**
 * 设置 Hook 事件转发
 *
 * 将 Agent Hook 事件转换为 StreamEvent 发送给客户端
 */
function setupHookForwarding(agent: Agent, sender: EventSender): Array<string> {
  const hookIds: Array<string> = [];
  const hookRegistry = agent.context.hookRegistry;

  // 思考事件
  hookIds.push(
    hookRegistry.on('agent:thinking', async (ctx: AgentThinkingHookContext): Promise<HookResult> => {
      sender.thinking(ctx.thought);
      return { proceed: true };
    })
  );

  // 工具调用事件
  hookIds.push(
    hookRegistry.on('tool:before', async (ctx: ToolBeforeHookContext): Promise<HookResult> => {
      sender.toolUse(ctx.toolName, ctx.input);
      return { proceed: true };
    })
  );

  // 进度事件
  hookIds.push(
    hookRegistry.on('task:progress', async (ctx: TaskProgressHookContext): Promise<HookResult> => {
      const total = ctx.totalSteps || 100;
      const current = Math.round((ctx.progress / 100) * total);
      sender.progress(current, total, ctx.description);
      return { proceed: true };
    })
  );

  return hookIds;
}

/**
 * 将探索深度字符串转换为 ThoroughnessLevel
 */
function toThoroughnessLevel(value?: string): ThoroughnessLevel {
  if (value === 'quick' || value === 'medium' || value === 'very-thorough') {
    return value;
  }
  return 'medium';
}

/**
 * 处理 Chat 请求
 */
async function handleChat(
  agent: Agent,
  request: Request,
  sender: EventSender
): Promise<void> {
  const payload = request.payload as ChatPayload;

  if (!payload.prompt) {
    sender.error('Missing prompt in chat request');
    return;
  }

  // 设置流式回调
  const options: Record<string, unknown> = {
    onText: (text: string) => {
      sender.chunk(text);
    },
    onTool: (toolName: string, input?: unknown) => {
      sender.toolUse(toolName, input);
    },
    onError: (error: Error) => {
      sender.error(error.message);
    },
  };

  // 添加可选参数
  if (payload.provider_id) {
    options.providerId = payload.provider_id;
  }
  if (payload.model_id) {
    options.modelId = payload.model_id;
  }
  if (payload.session_id) {
    options.sessionId = payload.session_id;
  }

  try {
    // 使用流式对话
    await agent.chatStream(payload.prompt, options);
    sender.done();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sender.error(errorMessage);
  }
}

/**
 * 处理 Explore 请求
 */
async function handleExplore(
  agent: Agent,
  request: Request,
  sender: EventSender
): Promise<void> {
  const payload = request.payload as ExplorePayload;

  if (!payload.prompt) {
    sender.error('Missing prompt in explore request');
    return;
  }

  const thoroughness = toThoroughnessLevel(payload.thoroughness);

  sender.thinking(`Exploring with ${thoroughness} thoroughness...`);

  try {
    const result = await agent.explore(payload.prompt, thoroughness);
    sender.chunk(result);
    sender.done();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sender.error(errorMessage);
  }
}

/**
 * 处理 Plan 请求
 */
async function handlePlan(
  agent: Agent,
  request: Request,
  sender: EventSender
): Promise<void> {
  const payload = request.payload as PlanPayload;

  if (!payload.prompt) {
    sender.error('Missing prompt in plan request');
    return;
  }

  sender.thinking('Creating plan...');

  try {
    const result = await agent.plan(payload.prompt);
    sender.chunk(result);
    sender.done();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sender.error(errorMessage);
  }
}

/**
 * 处理 Workflow 请求
 */
async function handleWorkflow(
  agent: Agent,
  request: Request,
  sender: EventSender
): Promise<void> {
  const payload = request.payload as WorkflowPayload;

  if (!payload.task) {
    sender.error('Missing task in workflow request');
    return;
  }

  sender.thinking('Starting workflow...');

  const options: Record<string, unknown> = {
    onPhase: (phase: string, message: string) => {
      sender.progress(0, 0, `[${phase}] ${message}`);
    },
    onTool: (tool: string, input?: unknown) => {
      sender.toolUse(tool, input);
    },
    onText: (text: string) => {
      sender.chunk(text);
    },
  };

  if (payload.cwd) {
    options.cwd = payload.cwd;
  }
  if (payload.maxTurns) {
    options.maxTurns = payload.maxTurns;
  }

  try {
    const result = await agent.runWorkflow(payload.task, options);

    if (result.success) {
      sender.chunk(result.executionPlan || 'Workflow completed successfully');
    } else {
      sender.error(result.error || 'Workflow failed');
    }
    sender.done();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sender.error(errorMessage);
  }
}

/**
 * 处理获取配置请求
 */
async function handleGetConfig(
  _agent: Agent,
  _request: Request,
  sender: EventSender
): Promise<void> {
  try {
    // 动态导入配置模块
    const { loadProvidersConfig } = await import('./config.js');

    // 从配置文件加载 providers
    const providers = await loadProvidersConfig();

    // 返回配置（通过 chunk 事件）
    sender.chunk(JSON.stringify({
      providers,
      agents: [
        { id: 'general', name: '通用助手', description: '适用于一般对话和问题解答' },
        { id: 'explore', name: '代码探索', description: '探索和分析代码库' },
        { id: 'plan', name: '规划助手', description: '制定实现计划和架构设计' },
        { id: 'code-reviewer', name: '代码审查', description: '代码质量审查和改进建议' },
      ],
    }));
    sender.done();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sender.error(`Failed to load config: ${errorMessage}`);
  }
}

/**
 * stdio 桥接器
 */
export class StdioBridge {
  private handler: RequestHandler | null = null;
  private rl: readline.Interface | null = null;
  private activeRequests: Map<string, AbortController> = new Map();

  /**
   * 设置请求处理器
   */
  setHandler(handler: RequestHandler): void {
    this.handler = handler;
  }

  /**
   * 启动桥接
   */
  start(): void {
    // 创建 readline 接口
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    // 监听每一行
    this.rl.on('line', async (line) => {
      await this.handleLine(line);
    });

    // 监听关闭
    this.rl.on('close', () => {
      this.stop();
    });

    // 发送就绪信号
    const readyEvent = createEvent('system', 'done', { status: 'ready' });
    console.log(JSON.stringify(readyEvent));
  }

  /**
   * 停止桥接
   */
  stop(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    // 取消所有活跃请求
    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }
    this.activeRequests.clear();
  }

  /**
   * 处理一行输入
   */
  private async handleLine(line: string): Promise<void> {
    // 跳过空行
    if (!line.trim()) {
      return;
    }

    try {
      // 解析请求
      const request: Request = JSON.parse(line);

      // 处理 quit 命令
      if (line.trim() === 'quit') {
        this.stop();
        process.exit(0);
        return;
      }

      // 处理 stop 请求
      if (request.type === 'stop') {
        this.handleStopRequest(request);
        return;
      }

      // 检查是否有处理器
      if (!this.handler) {
        const sender = createSender(request.id);
        sender.error('No request handler configured');
        return;
      }

      // 创建 AbortController
      const controller = new AbortController();
      this.activeRequests.set(request.id, controller);

      // 创建发送器
      const sender = createSender(request.id);

      try {
        // 调用处理器
        await this.handler(request, sender);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        sender.error(errorMessage);
      } finally {
        // 清理
        this.activeRequests.delete(request.id);
      }
    } catch (error) {
      // 解析错误
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorEvent = createEvent('unknown', 'error', {
        error: `Failed to parse request: ${errorMessage}`,
      });
      console.log(JSON.stringify(errorEvent));
    }
  }

  /**
   * 处理 stop 请求
   */
  private handleStopRequest(request: Request): void {
    const payload = request.payload as { request_id?: string };
    if (payload.request_id) {
      const controller = this.activeRequests.get(payload.request_id);
      if (controller) {
        controller.abort();
        this.activeRequests.delete(payload.request_id);
      }
    }
  }
}

/**
 * 默认请求处理器
 *
 * 调用 @aiclaw/core 的 Agent 处理请求
 */
export async function defaultHandler(
  request: Request,
  sender: EventSender
): Promise<void> {
  // 获取 Agent
  const agentManager = getAgentManager();
  const agent = await agentManager.getAgent();

  // 设置 Hook 转发
  const disposers = setupHookForwarding(agent, sender);

  try {
    // 根据请求类型分发
    switch (request.type) {
      case 'chat':
        await handleChat(agent, request, sender);
        break;
      case 'explore':
        await handleExplore(agent, request, sender);
        break;
      case 'plan':
        await handlePlan(agent, request, sender);
        break;
      case 'workflow':
        await handleWorkflow(agent, request, sender);
        break;
      case 'get_config':
        await handleGetConfig(agent, request, sender);
        break;
      default:
        sender.error(`Unknown request type: ${request.type}`);
    }
  } finally {
    // 清理 Hook 监听
    const hookRegistry = agent.context.hookRegistry;
    for (const hookId of disposers) {
      try {
        hookRegistry.off(hookId);
      } catch (error) {
        console.error('[Bridge] Error disposing hook:', error);
      }
    }
  }
}
