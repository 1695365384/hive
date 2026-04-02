/**
 * File 工具 — 文件操作（view / create / str_replace / insert）
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 支持命令级权限控制（方案 B：execute 内部过滤）。
 * 路径约束、敏感文件保护、输出截断。
 *
 * 内层 rawTool 返回 ToolResult（结构化），外层 createFileTool 返回 string（AI SDK 兼容）。
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import { truncateOutput } from './utils/output-safety.js';
import { isSensitiveFile, isPathAllowed } from './utils/security.js';
import type { ToolResult } from '../harness/types.js';
import { withHarness } from '../harness/with-harness.js';
import type { RawTool } from '../harness/with-harness.js';

/** 文件操作命令 */
const FILE_COMMANDS = ['view', 'create', 'str_replace', 'insert'] as const;
type FileCommand = (typeof FILE_COMMANDS)[number];

export interface FileToolOptions {
  /** 允许的文件操作命令（用于 Agent 权限控制） */
  allowedCommands?: readonly FileCommand[];
}

// ─── Zod discriminated union schema ───

const viewSchema = z.object({
  command: z.literal('view'),
  file_path: z.string().describe('Absolute path or path relative to working directory'),
  offset: z.number().min(1).optional().describe('Line number to start reading from (1-based)'),
  limit: z.number().min(1).optional().describe('Max number of lines to read'),
});

const createSchema = z.object({
  command: z.literal('create'),
  file_path: z.string().describe('Absolute path or path relative to working directory'),
  content: z.string().describe('File content'),
});

const strReplaceSchema = z.object({
  command: z.literal('str_replace'),
  file_path: z.string().describe('Absolute path or path relative to working directory'),
  old_str: z.string().describe('The original text to replace'),
  new_str: z.string().describe('The replacement text'),
});

const insertSchema = z.object({
  command: z.literal('insert'),
  file_path: z.string().describe('Absolute path or path relative to working directory'),
  insert_text: z.string().describe('Text to insert'),
  insert_line: z.number().describe('Line number after which to insert'),
});

const fileInputSchema = z.discriminatedUnion('command', [
  viewSchema,
  createSchema,
  strReplaceSchema,
  insertSchema,
]);

type ViewInput = z.infer<typeof viewSchema>;
type CreateInput = z.infer<typeof createSchema>;
type StrReplaceInput = z.infer<typeof strReplaceSchema>;
type InsertInput = z.infer<typeof insertSchema>;

export type FileToolInput = ViewInput | CreateInput | StrReplaceInput | InsertInput;

/** 创建原始工具（execute → ToolResult，不经 harness） */
export function createRawFileTool(options?: FileToolOptions): RawTool<FileToolInput> {
  const allowed = options?.allowedCommands ?? FILE_COMMANDS;
  const allowedSet = new Set(allowed);

  const descSuffix = allowed.length < FILE_COMMANDS.length
    ? ` Allowed operations for current agent: [${Array.from(allowed).join(', ')}]`
    : '';

  return {
    description: `File operations tool. Supports viewing, creating, and editing file contents.${descSuffix}`,
    inputSchema: zodSchema(fileInputSchema),
    execute: async (args): Promise<ToolResult> => {
      const { command, file_path: rawPath } = args;
      const filePath = resolve(rawPath);

      // 权限检查
      if (!allowedSet.has(command)) {
        return {
          ok: false,
          code: 'PERMISSION',
          error: `Current agent does not have permission to execute '${command}'. Allowed operations: [${Array.from(allowed).join(', ')}]`,
          context: { command, allowed: Array.from(allowed) },
        };
      }

      // 路径约束检查
      if (!isPathAllowed(filePath)) {
        return {
          ok: false,
          code: 'PATH_BLOCKED',
          error: `File path is outside the allowed working directory: ${filePath}`,
          context: { path: filePath },
        };
      }

      // 敏感文件检查
      const op = command === 'view' ? 'read' as const : 'write' as const;
      const sensitive = isSensitiveFile(filePath, op);
      if (sensitive.sensitive) {
        return {
          ok: false,
          code: 'SENSITIVE_FILE',
          error: `Access denied to ${op === 'read' ? 'read' : 'write'} sensitive file: ${sensitive.description}\nPath: ${filePath}`,
          context: { path: filePath, description: sensitive.description },
        };
      }

      try {
        switch (command) {
          case 'view':
            return await viewFile(filePath, args.offset, args.limit);
          case 'create':
            return await createFile(filePath, args.content);
          case 'str_replace':
            return await strReplace(filePath, args.old_str, args.new_str);
          case 'insert':
            return await insertLine(filePath, args.insert_line, args.insert_text);
          default:
            return {
              ok: false,
              code: 'UNKNOWN_COMMAND',
              error: `Unknown command: ${command}`,
            };
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          code: 'IO_ERROR',
          error: msg,
          context: { path: filePath },
        };
      }
    },
  };
}

/**
 * 创建 File 工具（AI SDK 兼容，execute → string）
 *
 * 内部使用 withHarness 包装 rawTool 逻辑。
 */
export function createFileTool(options?: FileToolOptions): Tool<FileToolInput, string> {
  return withHarness(createRawFileTool(options), { toolName: 'file-tool' });
}

// ============================================
// 内部函数（返回 ToolResult）
// ============================================

async function viewFile(
  filePath: string,
  offset?: number,
  limit?: number,
): Promise<ToolResult> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    if (isEnoent(error)) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: `File not found: ${filePath}`,
        context: { path: filePath },
      };
    }
    throw error;
  }

  const lines = content.split('\n');

  const start = (offset ?? 1) - 1;
  const end = limit ? start + limit : undefined;
  const sliced = lines.slice(start, end);

  // 添加行号
  const numbered = sliced
    .map((line, i) => `${String(start + i + 1).padStart(6)}\t${line}`)
    .join('\n');

  return {
    ok: true,
    code: 'OK',
    data: truncateOutput(numbered),
  };
}

async function createFile(filePath: string, content: string): Promise<ToolResult> {
  await writeFile(filePath, content, 'utf-8');
  return {
    ok: true,
    code: 'OK',
    data: `File created: ${filePath}`,
  };
}

async function strReplace(filePath: string, oldStr: string, newStr: string): Promise<ToolResult> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    if (isEnoent(error)) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: `File not found: ${filePath}`,
        context: { path: filePath },
      };
    }
    throw error;
  }

  // 空字符串守卫
  if (!oldStr) {
    return {
      ok: false,
      code: 'INVALID_PARAM',
      error: 'old_str must not be empty',
      context: { path: filePath },
    };
  }

  const matchCount = content.split(oldStr).length - 1;
  if (matchCount > 1) {
    return {
      ok: false,
      code: 'MATCH_AMBIGUOUS',
      error: `Found ${matchCount} matches, cannot determine replacement position. Provide more context to make the match unique.`,
      context: { path: filePath, matchCount },
    };
  }

  const index = content.indexOf(oldStr);
  if (index === -1) {
    return {
      ok: false,
      code: 'MATCH_FAILED',
      error: 'Text to replace not found. Ensure old_str exactly matches the file content (including indentation and newlines)',
      context: { path: filePath },
    };
  }

  const newContent = content.replace(oldStr, newStr);
  await writeFile(filePath, newContent, 'utf-8');
  return {
    ok: true,
    code: 'OK',
    data: `File updated: ${filePath} (1 replacement)`,
  };
}

async function insertLine(filePath: string, insertLineNum: number, insertText: string): Promise<ToolResult> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    if (isEnoent(error)) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: `File not found: ${filePath}`,
        context: { path: filePath },
      };
    }
    throw error;
  }

  const lines = content.split('\n');

  if (insertLineNum < 0 || insertLineNum > lines.length) {
    return {
      ok: false,
      code: 'INVALID_PARAM',
      error: `Line number ${insertLineNum} is out of range (file has ${lines.length} lines)`,
      context: { line: insertLineNum, total: lines.length, path: filePath },
    };
  }

  lines.splice(insertLineNum, 0, insertText);
  const newContent = lines.join('\n');
  await writeFile(filePath, newContent, 'utf-8');
  return {
    ok: true,
    code: 'OK',
    data: `File updated: ${filePath} (inserted after line ${insertLineNum})`,
  };
}

/** 检查错误是否为 ENOENT（文件不存在） */
function isEnoent(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/** 默认 File 工具实例（全权限） */
export const fileTool = createFileTool({ allowedCommands: FILE_COMMANDS });

/** 只读 File 工具实例 */
export const fileToolReadOnly = createFileTool({ allowedCommands: ['view'] as const });
