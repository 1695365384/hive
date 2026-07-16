/**
 * McpClient — 轻量级 MCP JSON-RPC 客户端
 *
 * 通过 stdio 与 MCP 服务器通信，处理 initialize 握手、
 * tools/list、tools/call 等协议方法。
 *
 * MCP 规范：https://spec.modelcontextprotocol.io/
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import { createInterface, type Interface } from 'node:readline';
import { isHttpMcpConfig, type McpServerConfig, type McpStdioServerConfig } from '../providers/types.js';

// ============================================
// 类型
// ============================================

/** MCP JSON-RPC 请求 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

/** MCP JSON-RPC 响应 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** MCP 工具定义 */
export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/** MCP 服务器能力 */
interface McpServerCapabilities {
  tools?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  prompts?: Record<string, unknown>;
}

/** MCP 服务器信息 */
export interface McpServerInfo {
  serverId: string;
  config: McpServerConfig;
  tools: McpToolDefinition[];
  connected: boolean;
  pid: number | null;
}

// ============================================
// 工具函数：JSON Schema → Zod 风格的描述对象
// ============================================

/**
 * 将 MCP 工具定义转为 AI SDK tool() 兼容的 inputSchema 描述。
 * 返回一个 zod 对象 schema 对象。
 */
import { z } from 'zod';

/**
 * 将 MCP JSON Schema 转为 Zod schema
 */
function mcpSchemaToZod(
  inputSchema: McpToolDefinition['inputSchema'],
): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const props = (inputSchema.properties ?? {}) as Record<string, any>;
  const required = new Set(inputSchema.required ?? []);

  for (const [key, prop] of Object.entries(props)) {
    let zodType: z.ZodTypeAny;

    switch (prop.type) {
      case 'string':
        zodType = z.string();
        break;
      case 'number':
      case 'integer':
        zodType = prop.type === 'integer' ? z.number().int() : z.number();
        break;
      case 'boolean':
        zodType = z.boolean();
        break;
      case 'array':
        zodType = z.array(z.any());
        break;
      case 'object':
        zodType = z.record(z.string(), z.any());
        break;
      default:
        zodType = z.any();
    }

    if (prop.description) {
      zodType = zodType.describe(prop.description);
    }

    if (required.has(key)) {
      shape[key] = zodType;
    } else {
      shape[key] = zodType.optional();
    }
  }

  return z.object(shape);
}

// ============================================
// McpClient
// ============================================

/**
 * 单个 MCP 服务器的客户端连接
 */
export class McpClient {
  private process: ChildProcess | null = null;
  private rl: Interface | null = null;
  private pendingRequests: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }> = new Map();
  private nextId = 1;
  private buffer = '';
  private _connected = false;
  private _tools: McpToolDefinition[] = [];
  private serverCapabilities: McpServerCapabilities | null = null;
  private _serverId: string;
  private _config: McpServerConfig;
  private reconnectTimer: NodeJS.Timeout | null = null;

  /** 崩溃/断线回调 */
  onDisconnect?: (serverId: string, error?: Error) => void;

  constructor(serverId: string, config: McpServerConfig) {
    this._serverId = serverId;
    this._config = config;
  }

  get serverId(): string { return this._serverId; }
  get config(): McpServerConfig { return this._config; }
  get connected(): boolean { return this._connected; }
  get tools(): McpToolDefinition[] { return this._tools; }
  get pid(): number | null { return this.process?.pid ?? null; }

  /**
   * 启动 MCP 服务器进程并建立连接
   */
  async connect(): Promise<void> {
    if (this._connected) return;

    if (isHttpMcpConfig(this._config)) {
      throw new Error('McpClient only supports stdio; use McpRemoteClient for HTTP');
    }

    const stdio = this._config as McpStdioServerConfig;
    const cmd = stdio.command;
    const args = stdio.args ?? [];
    const env = { ...process.env, ...stdio.env };

    // 解析命令路径
    const resolvedCmd = this.resolveCommand(cmd);

    this.process = spawn(resolvedCmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      shell: process.platform === 'win32',
    });

    this.process.on('error', (err) => {
      this._connected = false;
      this.onDisconnect?.(this._serverId, err);
    });

    this.process.on('exit', (code) => {
      this._connected = false;
      if (code !== 0) {
        this.scheduleReconnect();
      }
    });

    // 读取 stderr（日志输出）
    this.process.stderr?.on('data', (data: Buffer) => {
      // MCP 服务器可能在 stderr 输出日志，忽略或 debug 用
    });

    // 读取 stdout（JSON-RPC）
    this.rl = createInterface({ input: this.process.stdout! });
    this.rl.on('line', (line: string) => {
      this.handleMessage(line);
    });

    // 执行初始化握手
    await this.initialize();
  }

  /**
   * 初始化握手
   */
  private async initialize(): Promise<void> {
    const result = await this.request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: 'hive-core',
        version: '1.0.0',
      },
    }) as { protocolVersion: string; capabilities: McpServerCapabilities; serverInfo?: Record<string, unknown> };

    this.serverCapabilities = result.capabilities ?? {};

    // 发送 initialized 通知
    this.sendNotification('notifications/initialized', {});

    this._connected = true;

    // 获取工具列表
    if (this.serverCapabilities.tools) {
      await this.refreshTools();
    }
  }

  /**
   * 刷新工具列表
   */
  async refreshTools(): Promise<McpToolDefinition[]> {
    const result = await this.request('tools/list', {}) as { tools: McpToolDefinition[] };
    this._tools = result.tools ?? [];
    return this._tools;
  }

  /**
   * 调用 MCP 工具
   */
  async callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown> {
    return this.request('tools/call', {
      name,
      arguments: arguments_,
    });
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this._connected = false;

    // 拒绝所有待处理的请求
    for (const { reject, timer } of this.pendingRequests.values()) {
      clearTimeout(timer);
      reject(new Error('MCP client disconnected'));
    }
    this.pendingRequests.clear();

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  // ============================================
  // JSON-RPC 方法
  // ============================================

  private async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request timeout: ${method}`));
      }, 30_000);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.send(JSON.stringify(request));
    });
  }

  private sendNotification(method: string, params?: unknown): void {
    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.send(JSON.stringify(notification));
  }

  private send(raw: string): void {
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(raw + '\n');
    }
  }

  private handleMessage(line: string): void {
    if (!line.trim()) return;

    let parsed: JsonRpcResponse;
    try {
      parsed = JSON.parse(line);
    } catch {
      return; // 忽略非 JSON 输出
    }

    // 处理响应
    if (parsed.id !== undefined && this.pendingRequests.has(parsed.id)) {
      const { resolve, reject, timer } = this.pendingRequests.get(parsed.id)!;
      clearTimeout(timer);
      this.pendingRequests.delete(parsed.id);

      if (parsed.error) {
        reject(new Error(`MCP error: ${parsed.error.message} (code=${parsed.error.code})`));
      } else {
        resolve(parsed.result);
      }
    }
  }

  // ============================================
  // 内部
  // ============================================

  private resolveCommand(cmd: string): string {
    // npm 包名 → npx 执行
    if (!cmd.includes('/') && !cmd.includes('\\') && !cmd.startsWith('node')) {
      // 可能是 npx 包
      return cmd;
    }
    return cmd;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this._connected) {
        this.connect().catch(() => {});
      }
    }, 5_000);
  }
}

/**
 * 将 MCP 工具定义转为 AI SDK Tool
 */
import { zodSchema, tool, type Tool } from 'ai';

/** 可调用 MCP 工具的连接（stdio / remote 共用） */
export type McpToolCaller = {
  callTool: (name: string, arguments_: Record<string, unknown>) => Promise<unknown>;
};

export function mcpToolToAiTool(
  mcpTool: McpToolDefinition,
  client: McpToolCaller,
): Tool<any, string> {
  const zodSchema_ = mcpSchemaToZod(mcpTool.inputSchema);

  return tool({
    description: mcpTool.description ?? '',
    inputSchema: zodSchema(zodSchema_),
    execute: async (input: Record<string, unknown>): Promise<string> => {
      try {
        const result = await client.callTool(mcpTool.name, input);
        return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return `[Error] MCP tool '${mcpTool.name}' failed: ${msg}`;
      }
    },
  } as any);
}
