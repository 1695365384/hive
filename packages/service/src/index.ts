/**
 * @aiclaw/service - Node.js Service
 *
 * 基于 @aiclaw/core 的服务端实现
 * 支持两种通信模式：
 * - stdio: 通过 stdin/stdout 与 Tauri Sidecar 通信（默认）
 * - websocket: 通过 WebSocket 与前端/Rust 通信（--ws 参数）
 */

import { StdioBridge, defaultHandler } from './bridge.js';
import { initializeConfig, getConfig, validateConfig } from './config.js';
import { getAgentManager, resetAgentManager } from './agent-manager.js';
import { startWsServer } from './ws-server.js';

export * from './protocol.js';
export * from './bridge.js';
export * from './config.js';
export * from './agent-manager.js';
export * from './types.js';

export const VERSION = '0.1.0';

/**
 * 服务启动选项
 */
export interface StartOptions {
  /** 服务配置 */
  config?: Parameters<typeof initializeConfig>[0];
  /** 是否验证配置（默认 true） */
  validateConfig?: boolean;
}

/**
 * 启动服务
 */
export async function start(options?: StartOptions): Promise<void> {
  console.error('[Service] Starting AIClaw service...');
  console.error(`[Service] Version: ${VERSION}`);

  // 初始化配置
  await initializeConfig(options?.config);

  // 验证配置
  if (options?.validateConfig !== false) {
    const validation = validateConfig();
    if (!validation.valid) {
      console.error('[Service] Configuration errors:');
      for (const error of validation.errors) {
        console.error(`  - ${error}`);
      }
      throw new Error('Invalid configuration');
    }
    if (validation.warnings.length > 0) {
      console.error('[Service] Configuration warnings:');
      for (const warning of validation.warnings) {
        console.error(`  - ${warning}`);
      }
    }
  }

  const config = getConfig();

  // 初始化 Agent Manager
  const agentManager = getAgentManager();
  await agentManager.initialize({
    serviceConfig: config,
  });

  // 创建桥接
  const bridge = new StdioBridge();

  // 设置默认处理器
  bridge.setHandler(defaultHandler);

  // 设置优雅关闭
  setupGracefulShutdown(agentManager, bridge);

  // 启动桥接
  bridge.start();

  console.error('[Service] Service started successfully');
}

/**
 * 设置优雅关闭
 */
function setupGracefulShutdown(
  agentManager: ReturnType<typeof getAgentManager>,
  bridge: StdioBridge
): void {
  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    console.error('[Service] Shutting down...');

    // 停止桥接
    bridge.stop();

    // 销毁 Agent
    try {
      await agentManager.dispose();
    } catch (error) {
      console.error('[Service] Error during shutdown:', error);
    }

    console.error('[Service] Shutdown complete');
    process.exit(0);
  };

  // 监听终止信号
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // 监听未捕获的异常
  process.on('uncaughtException', (error) => {
    console.error('[Service] Uncaught exception:', error);
    shutdown().catch(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Service] Unhandled rejection:', reason);
  });
}

/**
 * 停止服务
 */
export async function stop(): Promise<void> {
  const agentManager = getAgentManager();
  await agentManager.dispose();
  resetAgentManager();
}

// 如果直接运行此文件，启动服务
// 使用更可靠的检测方式：检查是否通过 node 命令行直接运行
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const entryFile = resolve(process.argv[1] || '');

// 检测是否作为入口点运行
// 1. 直接路径匹配
// 2. 或者检查是否不是被其他模块导入（通过检查是否有父模块）
const isMain =
  __filename === entryFile ||
  entryFile.endsWith('service.js') ||
  entryFile.endsWith('service.ts') ||
  // 兜底：如果通过 sidecar 脚本调用，process.argv[1] 可能不同
  process.argv[1]?.includes('service');

if (isMain) {
  // 检测是否使用 WebSocket 模式
  const useWebSocket = process.argv.includes('--ws');

  if (useWebSocket) {
    // WebSocket 模式
    startWsServer().catch((error) => {
      console.error('[Service] Failed to start WebSocket server:', error);
      process.exit(1);
    });
  } else {
    // stdio 模式（默认）
    start().catch((error) => {
      console.error('[Service] Failed to start:', error);
      process.exit(1);
    });
  }
}
