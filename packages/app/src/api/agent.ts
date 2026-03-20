/**
 * Agent API 封装
 *
 * 封装 Tauri IPC 调用，提供类型安全的 API 接口
 */

import { invoke, Channel } from '@tauri-apps/api/core';
import type {
  StreamEvent,
  ServiceStatus,
  StreamChatOptions,
  ChatOptions,
  Config,
} from './types';

/**
 * 发送非流式对话请求
 *
 * @param options - 对话选项
 * @returns 请求 ID
 */
export async function chat(options: ChatOptions): Promise<string> {
  return invoke<string>('chat', {
    prompt: options.prompt,
    provider_id: options.providerId ?? null,
    model_id: options.modelId ?? null,
  });
}

/**
 * 发送流式对话请求
 *
 * @param options - 流式对话选项
 * @returns 请求 ID（可用于取消请求）
 */
export async function chatStream(options: StreamChatOptions): Promise<string> {
  const channel = new Channel<StreamEvent>();

  // 设置事件监听
  channel.onmessage = (event) => {
    // 调用用户回调
    options.onEvent(event);

    // 处理完成和错误事件
    if (event.event === 'done') {
      options.onDone?.();
    } else if (event.event === 'error') {
      const errorData = event.data as { error: string };
      options.onError?.(new Error(errorData.error));
    }
  };

  // 调用 Tauri 命令
  const requestId = await invoke<string>('chat_stream', {
    prompt: options.prompt,
    provider_id: options.providerId ?? null,
    model_id: options.modelId ?? null,
    session_id: options.sessionId ?? null,
    on_event: channel,
  });

  return requestId;
}

/**
 * 停止请求
 *
 * @param requestId - 要停止的请求 ID
 */
export async function stop(requestId: string): Promise<void> {
  await invoke('stop', { request_id: requestId });
}

/**
 * 启动 Service
 */
export async function startService(): Promise<void> {
  await invoke('start_service');
}

/**
 * 停止 Service
 */
export async function stopService(): Promise<void> {
  await invoke('stop_service');
}

/**
 * 获取 Service 状态
 */
export async function getServiceStatus(): Promise<ServiceStatus> {
  return invoke<ServiceStatus>('service_status');
}

/**
 * 获取配置信息（提供商、模型、Agent 列表）
 */
export async function getConfig(): Promise<Config> {
  return invoke<Config>('get_config');
}

/**
 * 创建 Agent API 实例
 */
export function createAgentApi() {
  return {
    chat,
    chatStream,
    stop,
    startService,
    stopService,
    getServiceStatus,
    getConfig,
  };
}

// 默认导出
export default createAgentApi();
