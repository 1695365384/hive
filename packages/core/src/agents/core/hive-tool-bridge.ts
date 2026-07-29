/**
 * Bridge Hive tools → oh-my-pi CustomTool shape.
 *
 * Hive extensions use RawTool execute (no AI SDK Tool wrapper on the hot path).
 * MCP tools still arrive as AI-SDK-shaped objects and are adapted structurally.
 *
 * NOTE: The broader Hive ToolRegistry / AI SDK built-ins are **legacy** for
 * vertical packs and tests — the AgentLoop hot path only uses this bridge +
 * pi builtins (jail via pi-security-extension).
 */

import { z } from 'zod';
import type { AgentContext } from '../types/core.js';
import {
  createRawSendFileTool,
} from '../../tools/built-in/send-file-tool.js';
import { createRawRememberTool } from '../../tools/built-in/remember-tool.js';
import { createRawEnvTool } from '../../tools/built-in/env-tool.js';
import { createRawAskUserTool } from '../../tools/built-in/ask-user-tool.js';
import { createRawWebFetchTool } from '../../tools/built-in/web-fetch-tool.js';
import { serializeToolResult } from '../../tools/harness/serializer.js';
import type { ToolResult } from '../../tools/harness/types.js';
import type { RawTool } from '../../tools/harness/with-harness.js';

/** Structural CustomTool compatible with createAgentSession({ customTools }). */
export interface BridgedCustomTool {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  loadMode?: 'essential' | 'discoverable';
  execute: (
    toolCallId: string,
    params: unknown,
    onUpdate: unknown,
    ctx: unknown,
    signal?: AbortSignal,
  ) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    details: unknown;
  }>;
}

function stringifyResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result == null) return '';
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function isToolResult(value: unknown): value is ToolResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    typeof (value as { ok: unknown }).ok === 'boolean'
  );
}

/**
 * Wrap a plain execute function as a pi CustomTool.
 */
export function bridgeAiSdkToolToCustomTool(input: {
  name: string;
  description: string;
  parameters: unknown;
  execute: (params: unknown, signal?: AbortSignal) => Promise<unknown>;
}): BridgedCustomTool {
  return {
    name: input.name,
    label: input.name,
    description: input.description,
    parameters: input.parameters,
    loadMode: 'essential',
    async execute(_toolCallId, params, _onUpdate, _ctx, signal) {
      const result = await input.execute(params, signal);
      const text = isToolResult(result)
        ? serializeToolResult(result, undefined, input.name)
        : stringifyResult(result);
      return {
        content: [{ type: 'text', text }],
        details: result,
      };
    },
  };
}

function bridgeRawTool<T>(input: {
  name: string;
  description: string;
  parameters: unknown;
  raw: RawTool<T>;
  mapParams?: (params: unknown) => T;
}): BridgedCustomTool {
  return bridgeAiSdkToolToCustomTool({
    name: input.name,
    description: input.description || input.raw.description || input.name,
    parameters: input.parameters,
    execute: async (params) => {
      const mapped = input.mapParams
        ? input.mapParams(params)
        : ((params ?? {}) as T);
      return input.raw.execute(mapped, {});
    },
  });
}

/** Parameter schemas mirrored from built-in Hive tools (zod v4). */
const sendFileParameters = z
  .object({
    filePath: z
      .string()
      .optional()
      .describe(
        'Absolute or relative path to the local file. MUST be within the working directory; paths outside will be rejected.',
      ),
    path: z
      .string()
      .optional()
      .describe('Alias of filePath (models often emit path)'),
    description: z
      .string()
      .optional()
      .describe('File description, shown as a caption when sending'),
  })
  .refine((v) => Boolean(v.filePath || v.path), {
    message: 'filePath or path is required',
  });

const rememberParameters = z.object({
  content: z
    .string()
    .describe('Information to remember about the user or conversation context'),
});

const envParameters = z.object({
  query: z
    .string()
    .optional()
    .describe('Fuzzy search keyword, e.g. "python", "docker", "notes"'),
  category: z
    .enum([
      'runtime',
      'pkgManager',
      'buildTool',
      'container',
      'vcs',
      'system',
      'native-app',
      'other',
    ])
    .optional()
    .describe(
      'Exact category name (runtime / pkgManager / buildTool / container / vcs / system / native-app / other)',
    ),
});

const askUserParameters = z.object({
  question: z.string().describe('The question to ask the user'),
  options: z
    .array(
      z.object({
        label: z.string().describe('Option label'),
        description: z
          .string()
          .optional()
          .describe('Detailed description of the option'),
      }),
    )
    .optional()
    .describe('Optional list of choices for the user to select from'),
});

const webFetchParameters = z.object({
  url: z.string().describe('Web page URL to fetch (HTTPS only)'),
  maxChars: z
    .number()
    .max(100000)
    .optional()
    .describe('Max characters of content to return, default 30000'),
});

/**
 * Build Hive-specific customTools for the pi kernel path (RawTool execute).
 */
export function buildHiveCustomTools(_context: AgentContext): BridgedCustomTool[] {
  return [
    bridgeRawTool({
      name: 'send-file',
      description:
        'Send a local file to the current session user. Supports files and images. IMPORTANT: The file path MUST be within the working directory. Prefer argument filePath (path is also accepted).',
      parameters: sendFileParameters,
      raw: createRawSendFileTool(),
      mapParams: (params) => {
        const raw = (params ?? {}) as {
          filePath?: string;
          path?: string;
          description?: string;
        };
        const filePath = raw.filePath || raw.path;
        if (!filePath) throw new Error('filePath or path is required');
        return { filePath, description: raw.description };
      },
    }),
    bridgeRawTool({
      name: 'remember',
      description:
        'Save important information about the user or conversation context to memory.',
      parameters: rememberParameters,
      raw: createRawRememberTool(),
    }),
    bridgeRawTool({
      name: 'env',
      description:
        'Query installed system tools and environment capabilities on demand.',
      parameters: envParameters,
      raw: createRawEnvTool(),
    }),
    bridgeRawTool({
      name: 'ask-user',
      description:
        'Ask the user a question to get clarification or let them make a choice.',
      parameters: askUserParameters,
      raw: createRawAskUserTool(),
    }),
    bridgeRawTool({
      name: 'web-fetch',
      description: 'Fetch web page content (plain text) from a URL. HTTPS only.',
      parameters: webFetchParameters,
      raw: createRawWebFetchTool(),
    }),
  ];
}

type McpToolLike = {
  description?: string;
  execute?: (
    params: unknown,
    options?: { abortSignal?: AbortSignal },
  ) => Promise<unknown>;
};

/**
 * Bridge connected MCP tools from Hive McpManager into customTools.
 */
export function bridgeMcpToolsToCustomTools(
  mcpTools: Record<string, McpToolLike>,
): BridgedCustomTool[] {
  const bridged: BridgedCustomTool[] = [];

  for (const [name, tool] of Object.entries(mcpTools)) {
    try {
      if (typeof tool.execute !== 'function') {
        console.warn(`[hive-tool-bridge] skip MCP tool "${name}": no execute`);
        continue;
      }

      const parameters = z.record(z.string(), z.unknown());
      const executeFn = tool.execute.bind(tool);

      bridged.push(
        bridgeAiSdkToolToCustomTool({
          name,
          description: tool.description || `MCP tool ${name}`,
          parameters,
          execute: (params, signal) =>
            executeFn(params, { abortSignal: signal }),
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[hive-tool-bridge] skip MCP tool "${name}": ${msg}`);
    }
  }

  return bridged;
}
