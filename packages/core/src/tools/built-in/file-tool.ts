/**
 * File 工具 — 文件操作（view / create / str_replace / insert）
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 支持命令级权限控制（方案 B：execute 内部过滤）。
 * 路径约束、敏感文件保护、输出截断。
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tool, zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import { truncateOutput } from './utils/output-safety.js';
import { isSensitiveFile, isPathAllowed } from './utils/security.js';

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
  file_path: z.string().describe('文件的绝对路径或相对于工作目录的路径'),
  offset: z.number().optional().describe('从第几行开始读取（从 1 开始）'),
  limit: z.number().optional().describe('最多读取的行数'),
});

const createSchema = z.object({
  command: z.literal('create'),
  file_path: z.string().describe('文件的绝对路径或相对于工作目录的路径'),
  content: z.string().describe('文件内容'),
});

const strReplaceSchema = z.object({
  command: z.literal('str_replace'),
  file_path: z.string().describe('文件的绝对路径或相对于工作目录的路径'),
  old_str: z.string().describe('要替换的原始文本'),
  new_str: z.string().describe('替换后的新文本'),
});

const insertSchema = z.object({
  command: z.literal('insert'),
  file_path: z.string().describe('文件的绝对路径或相对于工作目录的路径'),
  insert_text: z.string().describe('要插入的文本'),
  insert_line: z.number().describe('插入的行号（在该行之后插入）'),
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

/**
 * 创建 File 工具
 */
export function createFileTool(options?: FileToolOptions): Tool<FileToolInput, string> {
  const allowed = options?.allowedCommands ?? FILE_COMMANDS;
  const allowedSet = new Set(allowed);

  const descSuffix = allowed.length < FILE_COMMANDS.length
    ? ` 当前 Agent 允许的操作: [${Array.from(allowed).join(', ')}]`
    : '';

  return tool({
    description: `文件操作工具。支持查看、创建、编辑文件内容。${descSuffix}`,
    inputSchema: zodSchema(fileInputSchema),
    execute: async (args): Promise<string> => {
      const { command, file_path: rawPath } = args;
      const filePath = resolve(rawPath);

      // 权限检查
      if (!allowedSet.has(command)) {
        return `[Permission] 当前 Agent 无权限执行 '${command}' 操作。允许的操作: [${Array.from(allowed).join(', ')}]`;
      }

      // 路径约束检查
      if (!isPathAllowed(filePath)) {
        return `[Security] 文件路径不在允许的工作目录内: ${filePath}`;
      }

      // 敏感文件检查
      const op = command === 'view' ? 'read' as const : 'write' as const;
      const sensitive = isSensitiveFile(filePath, op);
      if (sensitive.sensitive) {
        return `[Security] 阻止${op === 'read' ? '读取' : '写入'}敏感文件: ${sensitive.description}\n路径: ${filePath}`;
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
            return `[Error] 未知命令: ${command}`;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return `[Error] ${msg}`;
      }
    },
  });
}

async function viewFile(
  filePath: string,
  offset?: number,
  limit?: number,
): Promise<string> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    if (isEnoent(error)) {
      return `[Error] 文件不存在: ${filePath}`;
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

  return truncateOutput(numbered);
}

async function createFile(filePath: string, content: string): Promise<string> {
  await writeFile(filePath, content, 'utf-8');
  return `[OK] 文件已创建: ${filePath}`;
}

async function strReplace(filePath: string, oldStr: string, newStr: string): Promise<string> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    if (isEnoent(error)) {
      return `[Error] 文件不存在: ${filePath}`;
    }
    throw error;
  }

  const index = content.indexOf(oldStr);
  if (index === -1) {
    return `[Error] 未找到要替换的文本。请确保 old_str 与文件内容完全匹配（包括缩进和换行）`;
  }

  const newContent = content.replace(oldStr, newStr);
  await writeFile(filePath, newContent, 'utf-8');
  return `[OK] 文件已更新: ${filePath}（替换了 1 处）`;
}

async function insertLine(filePath: string, insertLineNum: number, insertText: string): Promise<string> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    if (isEnoent(error)) {
      return `[Error] 文件不存在: ${filePath}`;
    }
    throw error;
  }

  const lines = content.split('\n');

  if (insertLineNum < 0 || insertLineNum > lines.length) {
    return `[Error] 行号 ${insertLineNum} 超出范围（文件共 ${lines.length} 行）`;
  }

  lines.splice(insertLineNum, 0, insertText);
  const newContent = lines.join('\n');
  await writeFile(filePath, newContent, 'utf-8');
  return `[OK] 文件已更新: ${filePath}（在第 ${insertLineNum} 行后插入）`;
}

/** 检查错误是否为 ENOENT（文件不存在） */
function isEnoent(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/** 默认 File 工具实例（全权限） */
export const fileTool = createFileTool({ allowedCommands: FILE_COMMANDS });

/** 只读 File 工具实例 */
export const fileToolReadOnly = createFileTool({ allowedCommands: ['view'] as const });
