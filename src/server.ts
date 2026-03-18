/**
 * HTTP API 服务 - 供 C 端应用调用
 *
 * 启动方式: npm run server
 * 端口: 3000 (可通过 PORT 环境变量修改)
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Agent, getAgent } from './agents/index.js';
import { preferences } from './services/preferences.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const agent = getAgent();

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 发送 JSON
function sendJson(res: ServerResponse, status: number, data: unknown) {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// 路由处理
async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url?.split('?')[0] || '/';
  const method = req.method;

  // CORS 预检
  if (method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    return res.end();
  }

  try {
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
      return sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
    }

    // 404
    return sendJson(res, 404, { success: false, error: 'Not Found' });

  } catch (error) {
    console.error('Request error:', error);
    return sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error',
    });
  }
}

// 启动服务器
const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   Claude Agent Service                   ║
║   端口: ${PORT}                            ║
╠══════════════════════════════════════════╣
║   API 端点:                              ║
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
