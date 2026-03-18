/**
 * HTTP API 服务 - 供 C 端应用调用
 *
 * 启动方式: npm run server
 * 端口: 3000 (可通过 PORT 环境变量修改)
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Agent, getAgent } from './agents/index.js';
import { preferences } from './services/preferences.js';

// ============================================
// 配置
// ============================================

const PORT = parseInt(process.env.PORT || '3000', 10);

// ============================================
// 初始化
// ============================================

const agent = getAgent();

let isShuttingDown = false;
let activeRequests = 0;

// ============================================
// Hook 注册示例
// ============================================

const hookRegistry = agent.context.hookRegistry;

// Hook 示例 1: 安全检查 - 阻止危险的 Bash 命令
hookRegistry.on('tool:before', async (ctx) => {
  if (ctx.toolName === 'Bash') {
    const command = ctx.input.command as string;
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,          // rm -rf /
      /rm\s+-rf\s+~/,           // rm -rf ~
      />\s*\/dev\/sd/,          // 覆盖磁盘
      /mkfs/,                   // 格式化
      /dd\s+if=.*of=\/dev/,     // dd 写入设备
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        console.warn(`[Hook:Security] Blocked dangerous command: ${command}`);
        return {
          proceed: false,
          error: new Error(`Blocked dangerous command pattern: ${pattern.source}`),
        };
      }
    }
  }
  return { proceed: true };
}, { priority: 'highest', description: '安全检查 - 阻止危险命令' });

// Hook 示例 2: 会话日志 - 记录会话生命周期
hookRegistry.on('session:start', async (ctx) => {
  console.log(`[Hook:Logger] Session started: ${ctx.sessionId}`);
  return { proceed: true };
}, { priority: 'normal', description: '会话日志 - 开始' });

hookRegistry.on('session:end', async (ctx) => {
  console.log(`[Hook:Logger] Session ended: ${ctx.sessionId}, duration: ${ctx.duration}ms, success: ${ctx.success}`);
  return { proceed: true };
}, { priority: 'normal', description: '会话日志 - 结束' });

hookRegistry.on('session:error', async (ctx) => {
  console.error(`[Hook:Logger] Session error: ${ctx.sessionId}, error: ${ctx.error.message}`);
  return { proceed: true };
}, { priority: 'high', description: '会话日志 - 错误' });

// Hook 示例 3: 工具执行监控 - 记录工具调用
hookRegistry.on('tool:after', async (ctx) => {
  const status = ctx.success ? '✓' : '✗';
  console.log(`[Hook:Monitor] Tool ${status} ${ctx.toolName} (${ctx.duration}ms)`);
  return { proceed: true };
}, { priority: 'low', description: '工具执行监控' });

// Hook 示例 4: 能力生命周期监控
hookRegistry.on('capability:init', async (ctx) => {
  console.log(`[Hook:Lifecycle] Capability initialized: ${ctx.capabilityName}`);
  return { proceed: true };
}, { priority: 'low', description: '能力初始化监控' });

hookRegistry.on('capability:dispose', async (ctx) => {
  console.log(`[Hook:Lifecycle] Capability disposed: ${ctx.capabilityName}`);
  return { proceed: true };
}, { priority: 'low', description: '能力销毁监控' });

// ============================================
// 工具函数
// ============================================

// JSON 解析
async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// CORS 头
function setCors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// 发送 JSON
function sendJson(res: ServerResponse, status: number, data: unknown) {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ============================================
// 路由处理
// ============================================

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  if (isShuttingDown) {
    return sendJson(res, 503, { success: false, error: 'Server is shutting down' });
  }

  const url = req.url?.split('?')[0] || '/';
  const method = req.method;
  activeRequests++;

  // CORS 预检
  if (method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    activeRequests--;
    return res.end();
  }

  try {
    // ============================================
    // 公共 API
    // ============================================

    // POST /chat - 对话
    if (url === '/chat' && method === 'POST') {
      const body = await parseBody<{ prompt: string; options?: Record<string, unknown> }>(req);
      const result = await agent.chat(body.prompt);
      return sendJson(res, 200, { success: true, result });
    }

    // POST /chat/stream - 流式对话
    if (url === '/chat/stream' && method === 'POST') {
      const body = await parseBody<{ prompt: string; options?: Record<string, unknown> }>(req);

      setCors(res);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      await agent.chatStream(body.prompt, {
        onText: (text: string) => {
          res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
        },
        onTool: (tool: string) => {
          res.write(`data: ${JSON.stringify({ type: 'tool', name: tool })}\n\n`);
        },
        onError: (error: Error) => {
          res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        },
      });

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      return res.end();
    }

    // POST /explore - 代码探索
    if (url === '/explore' && method === 'POST') {
      const body = await parseBody<{ prompt: string; thoroughness?: string }>(req);
      const result = await agent.explore(body.prompt, body.thoroughness as 'quick' | 'medium' | 'very-thorough');
      return sendJson(res, 200, { success: true, result });
    }

    // POST /plan - 规划
    if (url === '/plan' && method === 'POST') {
      const body = await parseBody<{ prompt: string }>(req);
      const result = await agent.plan(body.prompt);
      return sendJson(res, 200, { success: true, result });
    }

    // POST /workflow - 工作流
    if (url === '/workflow' && method === 'POST') {
      const body = await parseBody<{ prompt: string }>(req);
      const result = await agent.runWorkflow(body.prompt);
      return sendJson(res, 200, { success: true, result });
    }

    // GET /preferences - 获取偏好
    if (url === '/preferences' && method === 'GET') {
      return sendJson(res, 200, { success: true, preferences: preferences.getAll() });
    }

    // POST /preferences - 设置偏好
    if (url === '/preferences' && method === 'POST') {
      const body = await parseBody<{ key: string; value: unknown }>(req);
      preferences.set(body.key as any, body.value as any);
      return sendJson(res, 200, { success: true });
    }

    // GET /health - 健康检查
    if (url === '/health' && method === 'GET') {
      return sendJson(res, 200, {
        status: 'ok',
        timestamp: new Date().toISOString(),
        activeRequests,
      });
    }

    // 404
    return sendJson(res, 404, { success: false, error: 'Not Found' });

  } catch (error) {
    console.error('Request error:', error);
    return sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error',
    });
  } finally {
    activeRequests--;
  }
}

// ============================================
// 服务器启动
// ============================================

const server = createServer(handleRequest);

// 优雅关闭
async function gracefulShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('\n[Server] Shutting down gracefully...');

  // 停止接受新连接
  server.close(() => {
    console.log('[Server] HTTP server closed');
  });

  // 等待活跃请求完成
  const maxWait = 10000;
  const startTime = Date.now();
  while (activeRequests > 0 && Date.now() - startTime < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 销毁Agent
  try {
    await agent.dispose();
  } catch (error) {
    console.error('[Server] Error disposing agent:', error);
  }

  console.log('[Server] Shutdown complete');
  process.exit(0);
}

// 信号处理
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled rejection at:', promise, 'reason:', reason);
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   Claude Agent Service                   ║
║   端口: ${PORT}                            ║
╠══════════════════════════════════════════╣
║   公共 API:                              ║
║   POST /chat          - 对话             ║
║   POST /chat/stream   - 流式对话         ║
║   POST /explore       - 代码探索         ║
║   POST /plan          - 规划             ║
║   POST /workflow      - 工作流           ║
║   GET  /preferences   - 获取偏好         ║
║   POST /preferences   - 设置偏好         ║
║   GET  /health        - 健康检查         ║
╚══════════════════════════════════════════╝
  `);
});
