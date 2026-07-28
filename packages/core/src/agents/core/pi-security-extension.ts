/**
 * Hive workspace jail as a pi-coding-agent inline extension.
 * Blocks pi builtins (read/edit/write/bash/glob/grep) that escape allowed roots
 * or run dangerous shell commands.
 */

import { resolve } from 'node:path';
import {
  isDangerousCommand,
  isPathAllowed,
  isSensitiveFile,
} from '../../tools/built-in/utils/security.js';

const PATH_TOOLS = new Set(['read', 'edit', 'write', 'glob', 'grep']);
const WRITE_TOOLS = new Set(['edit', 'write']);

type ToolCallLike = {
  toolName?: string;
  input?: Record<string, unknown>;
};

function extractPath(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  for (const key of ['path', 'filePath', 'file_path', 'target_directory', 'cwd', 'directory']) {
    const v = input[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return undefined;
}

function extractCommand(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  const cmd = input.command ?? input.cmd;
  return typeof cmd === 'string' ? cmd : undefined;
}

/**
 * Pure guard used by the extension and unit tests.
 */
export function evaluatePiToolSecurity(
  toolName: string,
  input: Record<string, unknown> | undefined,
): { block: true; reason: string } | { block: false } {
  if (toolName === 'bash') {
    const command = extractCommand(input);
    if (command) {
      const danger = isDangerousCommand(command);
      if (danger.dangerous) {
        return {
          block: true,
          reason: `Command blocked by Hive security policy (${danger.description ?? 'dangerous operation'})`,
        };
      }
    }
    return { block: false };
  }

  if (!PATH_TOOLS.has(toolName)) {
    return { block: false };
  }

  const rawPath = extractPath(input);
  if (!rawPath) {
    // Some glob/grep calls omit path (cwd default) — allow.
    return { block: false };
  }

  const absolute = resolve(rawPath);
  const op = WRITE_TOOLS.has(toolName) ? 'write' : 'read';

  if (!isPathAllowed(absolute, op)) {
    return {
      block: true,
      reason: `Path blocked by Hive workspace jail (${op}): ${absolute}`,
    };
  }

  const sensitive = isSensitiveFile(absolute, op);
  if (sensitive.sensitive) {
    return {
      block: true,
      reason: `Refused sensitive file (${sensitive.description}): ${absolute}`,
    };
  }

  return { block: false };
}

/**
 * Inline ExtensionFactory for createAgentSession({ extensions: [...] }).
 */
export function createHiveSecurityExtension(): (api: {
  on: (event: string, handler: (event: ToolCallLike) => unknown) => void;
}) => void {
  return (api) => {
    api.on('tool_call', (event) => {
      const name = event.toolName ?? '';
      const verdict = evaluatePiToolSecurity(name, event.input);
      if (verdict.block) {
        return { block: true, reason: verdict.reason };
      }
      return undefined;
    });
  };
}
