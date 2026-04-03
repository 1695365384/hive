/**
 * Worker 线程入口
 *
 * 在独立线程中执行子代理任务。
 * 接收主线程的执行指令，独立创建 ProviderManager + AgentRunner，
 * 执行 LLM 调用并通过 parentPort 回传事件。
 *
 * 取消机制：主线程调用 worker.terminate() 直接杀线程，无需 abort 信号穿透。
 */

import { parentPort, workerData } from 'node:worker_threads';
import { createProviderManager } from '../providers/ProviderManager.js';
import { createAgentRunner } from '../agents/core/runner.js';
import type { AgentResult } from '../agents/core/types.js';

// ============================================
// 消息协议
// ============================================

/** 主线程 → Worker 的消息 */
export interface WorkerExecuteMessage {
  type: 'execute';
  payload: {
    agentType: string;
    prompt: string;
    model?: string;
    maxTurns?: number;
  };
}

/** 通过 workerData 传递的初始化数据 */
export interface WorkerInitData {
  externalConfig?: import('../providers/types.js').ExternalConfig;
}

/** Worker → 主线程的事件消息 */
export type WorkerEventMessage =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolName: string; input?: unknown }
  | { type: 'tool-result'; toolName: string; output?: unknown }
  | { type: 'reasoning'; text: string }
  | { type: 'complete'; result: AgentResult; duration: number }
  | { type: 'error'; error: string; duration: number };

// ============================================
// Worker 主逻辑
// ============================================

function post(msg: WorkerEventMessage): void {
  parentPort?.postMessage(msg);
}

async function handleMessage(msg: WorkerExecuteMessage): Promise<void> {
  if (msg.type !== 'execute') return;

  const { agentType, prompt, model, maxTurns } = msg.payload;
  const startTime = Date.now();

  try {
    // 使用主线程传入的外部配置创建 ProviderManager（继承 hive.config.json 配置）
    const initData = workerData as WorkerInitData | undefined;
    const providerManager = createProviderManager({
      externalConfig: initData?.externalConfig,
      useEnvFallback: true,
    });
    const runner = createAgentRunner(providerManager);

    const opts: Record<string, unknown> = {};
    if (model) opts.model = model;
    if (maxTurns) opts.maxTurns = maxTurns;

    const result = await runner.executeStreaming(
      agentType,
      prompt,
      {
        onText: (text: string) => {
          post({ type: 'text', text });
        },
        onToolCall: (toolName: string, input?: unknown) => {
          post({ type: 'tool-call', toolName, input });
        },
        onToolResult: (toolName: string, output?: unknown) => {
          post({ type: 'tool-result', toolName, output });
        },
        onReasoning: (text: string) => {
          post({ type: 'reasoning', text });
        },
      },
      Object.keys(opts).length > 0 ? opts as any : undefined,
    );

    post({ type: 'complete', result, duration: Date.now() - startTime });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    post({ type: 'error', error: errorMsg, duration: Date.now() - startTime });
  }
}

// 监听主线程消息
parentPort?.on('message', (msg: WorkerExecuteMessage) => {
  handleMessage(msg).catch((error) => {
    post({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    });
  });
});
