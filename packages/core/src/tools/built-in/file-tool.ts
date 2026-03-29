/**
 * File 工具 — 文件操作（view / create / str_replace / insert）
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 支持命令级权限控制（方案 B：execute 内部过滤）。
 * 敏感文件保护、输出截断。
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tool, zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import { truncateOutput } from './utils/output-safety.js';
import { isSensitiveFile } from './utils/security.js';

/** 文件操作命令 */
const FILE_COMMANDS = ['view', 'create', 'str_replace', 'insert'] as const;
type FileCommand = (typeof FILE_COMMANDS)[number];

export interface FileToolOptions {
  /** 允许的文件操作命令（用于 Agent 权限控制） */
  allowedCommands?: readonly FileCommand[];
}

/** File 工具输入 schema */
const fileInputSchema = z.object({
  command: z.enum(FILE_COMMANDS).describe('操作类型: view(读取文件), create(创建新文件), str_replace(替换文本), insert(插入文本)'),
  file_path: z.string().describe('文件的绝对路径或相对于工作目录的路径'),
  // view 参数
  offset: z.number().optional().describe('从第几行开始读取（从 1 开始），仅 view 命令有效'),
  limit: z.number().optional().describe('最多读取的行数，仅 view 命令有效'),
  // create 参数
  content: z.string().optional().describe('文件内容，仅 create 命令有效'),
  // str_replace 参数
  old_str: z.string().optional().describe('要替换的原始文本，仅 str_replace 命令有效'),
  new_str: z.string().optional().describe('替换后的新文本，仅 str_replace 命令有效'),
  // insert 参数
  insert_text: z.string().optional().describe('要插入的文本，仅 insert 命令有效'),
  insert_line: z.number().optional().describe('插入的行号（在该行之后插入），仅 insert 命令有效'),
});

export type FileToolInput = z.infer<typeof fileInputSchema>;

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
      const { command, file_path: filePath } = args;

      // 权限检查
      if (!allowedSet.has(command)) {
        return `[Permission] 当前 Agent 无权限执行 '${command}' 操作。允许的操作: [${Array.from(allowed).join(', ')}]`;
      }

      // 敏感文件检查
      if (command !== 'view') {
        const sensitive = isSensitiveFile(filePath, 'write');
        if (sensitive.sensitive) {
          return `[Security] 阻止写入敏感文件: ${sensitive.description}\n路径: ${filePath}`;
        }
      } else {
        const sensitive = isSensitiveFile(filePath, 'read');
        if (sensitive.sensitive) {
          return `[Security] 阻止读取敏感文件: ${sensitive.description}\n路径: ${filePath}`;
        }
      }

      try {
        switch (command) {
          case 'view':
            return await viewFile(filePath, args.offset, args.limit);
          case 'create':
            return await createFile(filePath, args.content!);
          case 'str_replace':
            return await strReplace(filePath, args.old_str!, args.new_str!);
          case 'insert':
            return await insertLine(filePath, args.insert_line!, args.insert_text!);
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
  if (!existsSync(filePath)) {
    return `[Error] 文件不存在: ${filePath}`;
  }

  const content = await readFile(filePath, 'utf-8');
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
  if (!existsSync(filePath)) {
    return `[Error] 文件不存在: ${filePath}`;
  }

  const content = await readFile(filePath, 'utf-8');
  const index = content.indexOf(oldStr);
  if (index === -1) {
    return `[Error] 未找到要替换的文本。请确保 old_str 与文件内容完全匹配（包括缩进和换行）`;
  }

  const newContent = content.replace(oldStr, newStr);
  await writeFile(filePath, newContent, 'utf-8');
  return `[OK] 文件已更新: ${filePath}（替换了 1 处）`;
}

async function insertLine(filePath: string, insertLineNum: number, insertText: string): Promise<string> {
  if (!existsSync(filePath)) {
    return `[Error] 文件不存在: ${filePath}`;
  }

  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  if (insertLineNum < 0 || insertLineNum > lines.length) {
    return `[Error] 行号 ${insertLineNum} 超出范围（文件共 ${lines.length} 行）`;
  }

  lines.splice(insertLineNum, 0, insertText);
  const newContent = lines.join('\n');
  await writeFile(filePath, newContent, 'utf-8');
  return `[OK] 文件已更新: ${filePath}（在第 ${insertLineNum} 行后插入）`;
}

/** 默认 File 工具实例（全权限） */
export const fileTool = createFileTool({ allowedCommands: FILE_COMMANDS });

/** 只读 File 工具实例 */
export const fileToolReadOnly = createFileTool({ allowedCommands: ['view'] as const });
