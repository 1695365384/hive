/**
 * McpRemoteClient — 远程 MCP（Streamable HTTP 优先，SSE 回退）
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { McpHttpServerConfig } from '../providers/types.js';
import { isAllowedUrl, isPrivateIP } from '../tools/built-in/utils/security.js';
import type { McpToolDefinition } from './McpClient.js';

const CONNECT_TIMEOUT_MS = 15_000;

export class McpRemoteClient {
  private client: Client | null = null;
  private _connected = false;
  private _tools: McpToolDefinition[] = [];
  private _serverId: string;
  private _config: McpHttpServerConfig;

  onDisconnect?: (serverId: string, error?: Error) => void;

  constructor(serverId: string, config: McpHttpServerConfig) {
    this._serverId = serverId;
    this._config = config;
  }

  get serverId(): string { return this._serverId; }
  get config(): McpHttpServerConfig { return this._config; }
  get connected(): boolean { return this._connected; }
  get tools(): McpToolDefinition[] { return this._tools; }
  get pid(): number | null { return null; }

  async connect(): Promise<void> {
    if (this._connected) return;

    const urlCheck = isAllowedUrl(this._config.url);
    if (!urlCheck.allowed) {
      throw new Error(urlCheck.reason ?? 'URL not allowed');
    }

    const hostname = new URL(this._config.url).hostname;
    if (await isPrivateIP(hostname)) {
      throw new Error(`Refusing MCP URL that resolves to a private address: ${hostname}`);
    }

    const requestHeaders = this._config.headers;

    try {
      await this.connectWithTimeout(async () => {
        const client = new Client({ name: 'hive-core', version: '1.0.0' });
        const transport = new StreamableHTTPClientTransport(new URL(this._config.url), {
          requestInit: requestHeaders ? { headers: requestHeaders } : undefined,
        });
        await client.connect(transport);
        this.client = client;
      });
    } catch (streamableErr) {
      try {
        await this.connectWithTimeout(async () => {
          const client = new Client({ name: 'hive-core', version: '1.0.0' });
          const transport = new SSEClientTransport(new URL(this._config.url), {
            requestInit: requestHeaders ? { headers: requestHeaders } : undefined,
          });
          await client.connect(transport);
          this.client = client;
        });
      } catch (sseErr) {
        const a = streamableErr instanceof Error ? streamableErr.message : String(streamableErr);
        const b = sseErr instanceof Error ? sseErr.message : String(sseErr);
        throw new Error(`Remote MCP connect failed (Streamable HTTP: ${a}; SSE: ${b})`);
      }
    }

    this._connected = true;
    await this.refreshTools();
  }

  async refreshTools(): Promise<McpToolDefinition[]> {
    if (!this.client) return [];
    const result = await this.client.listTools();
    this._tools = (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: (t.inputSchema ?? { type: 'object' }) as McpToolDefinition['inputSchema'],
    }));
    return this._tools;
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error('Remote MCP client not connected');
    return this.client.callTool({ name, arguments: arguments_ });
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this._tools = [];
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // ignore
      }
      this.client = null;
    }
  }

  private async connectWithTimeout(fn: () => Promise<void>): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`MCP remote connect timeout after ${CONNECT_TIMEOUT_MS}ms`)),
            CONNECT_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
