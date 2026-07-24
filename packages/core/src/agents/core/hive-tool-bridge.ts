/**
 * Bridge Hive AI SDK tools → oh-my-pi CustomTool shape.
 *
 * Reuses existing factory execute logic; does not copy business rules.
 */

import { z } from 'zod';
import type { Tool } from 'ai';
import type { AgentContext } from '../types/core.js';
import { createSendFileTool } from '../../tools/built-in/send-file-tool.js';
import { createRememberTool } from '../../tools/built-in/remember-tool.js';
import { createEnvTool } from '../../tools/built-in/env-tool.js';
import { createAskUserTool } from '../../tools/built-in/ask-user-tool.js';
import { createWebFetchTool } from '../../tools/built-in/web-fetch-tool.js';

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

/**
 * Wrap a Hive tool execute function as a pi CustomTool.
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
      return {
        content: [{ type: 'text', text: stringifyResult(result) }],
        details: result,
      };
    },
  };
}

type AnyAiTool = Tool<any, any> & {
  description?: string;
  execute?: (params: any, options?: { abortSignal?: AbortSignal }) => Promise<any>;
};

async function invokeAiTool(
  tool: AnyAiTool,
  params: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  if (typeof tool.execute !== 'function') {
    throw new Error('Tool has no execute function');
  }
  // Extra options args are ignored by single-arg executes.
  return await tool.execute(params as any, { abortSignal: signal } as any);
}

/** Parameter schemas mirrored from built-in Hive tools (zod v4). */
const sendFileParameters = z.object({
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
}).refine((v) => Boolean(v.filePath || v.path), {
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

function bridgeNamedHiveTool(input: {
  name: string;
  description: string;
  parameters: unknown;
  tool: AnyAiTool;
}): BridgedCustomTool {
  return bridgeAiSdkToolToCustomTool({
    name: input.name,
    description: input.description || input.tool.description || input.name,
    parameters: input.parameters,
    execute: (params, signal) => invokeAiTool(input.tool, params, signal),
  });
}

/**
 * Build Hive-specific customTools for the pi kernel path.
 * Keeps Hive names (`send-file`, etc.) — do not rename to pi `ask`.
 */
export function buildHiveCustomTools(_context: AgentContext): BridgedCustomTool[] {
  return [
    bridgeAiSdkToolToCustomTool({
      name: 'send-file',
      description:
        'Send a local file to the current session user. Supports files and images. IMPORTANT: The file path MUST be within the working directory. Prefer argument filePath (path is also accepted).',
      parameters: sendFileParameters,
      execute: async (params, signal) => {
        const raw = (params ?? {}) as { filePath?: string; path?: string; description?: string };
        const filePath = raw.filePath || raw.path;
        if (!filePath) throw new Error('filePath or path is required');
        return invokeAiTool(createSendFileTool() as AnyAiTool, {
          filePath,
          description: raw.description,
        }, signal);
      },
    }),
    bridgeNamedHiveTool({
      name: 'remember',
      description:
        'Save important information about the user or conversation context to memory.',
      parameters: rememberParameters,
      tool: createRememberTool() as AnyAiTool,
    }),
    bridgeNamedHiveTool({
      name: 'env',
      description:
        'Query installed system tools and environment capabilities on demand.',
      parameters: envParameters,
      tool: createEnvTool() as AnyAiTool,
    }),
    bridgeNamedHiveTool({
      name: 'ask-user',
      description:
        'Ask the user a question to get clarification or let them make a choice.',
      parameters: askUserParameters,
      tool: createAskUserTool() as AnyAiTool,
    }),
    bridgeNamedHiveTool({
      name: 'web-fetch',
      description:
        'Fetch web page content (plain text) from a URL. HTTPS only.',
      parameters: webFetchParameters,
      tool: createWebFetchTool() as AnyAiTool,
    }),
  ];
}

/**
 * Bridge connected MCP tools from Hive McpManager into customTools.
 * Skips tools whose schema/execute cannot be bridged (logs + continues).
 */
export function bridgeMcpToolsToCustomTools(
  mcpTools: Record<string, Tool>,
): BridgedCustomTool[] {
  const bridged: BridgedCustomTool[] = [];

  for (const [name, tool] of Object.entries(mcpTools)) {
    try {
      const aiTool = tool as AnyAiTool;
      if (typeof aiTool.execute !== 'function') {
        console.warn(`[hive-tool-bridge] skip MCP tool "${name}": no execute`);
        continue;
      }

      // Prefer a permissive object schema when zod schema is not recoverable.
      const parameters = z.record(z.string(), z.unknown());

      bridged.push(
        bridgeAiSdkToolToCustomTool({
          name,
          description: aiTool.description || `MCP tool ${name}`,
          parameters,
          execute: (params, signal) => invokeAiTool(aiTool, params, signal),
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[hive-tool-bridge] skip MCP tool "${name}": ${msg}`);
    }
  }

  return bridged;
}
