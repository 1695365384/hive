/**
 * Grep 工具 — 文件内容正则搜索
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 */

import { exec } from 'node:child_process';
import { tool, zodSchema, type Tool } from 'ai';
import { z } from 'zod';

/** Grep 工具输入 schema */
const grepInputSchema = z.object({
  pattern: z.string().describe('正则表达式搜索模式'),
  path: z.string().optional().describe('搜索的目录，默认为当前工作目录'),
  glob: z.string().optional().describe('文件类型过滤，如 "*.ts"、"*.tsx"，默认搜索所有文件'),
  maxResults: z.number().optional().describe('最大返回结果数，默认 50'),
  caseInsensitive: z.boolean().optional().describe('是否忽略大小写，默认 false'),
});

export type GrepToolInput = z.infer<typeof grepInputSchema>;

/**
 * 创建 Grep 工具
 */
export function createGrepTool(): Tool<GrepToolInput, string> {
  return tool({
    description: '使用正则表达式搜索文件内容。返回匹配的文件路径、行号和匹配行。',
    inputSchema: zodSchema(grepInputSchema),
    execute: async ({ pattern, path: searchPath, glob: globFilter, maxResults, caseInsensitive }): Promise<string> => {
      const max = maxResults ?? 50;
      const dir = searchPath || process.cwd();
      const caseFlag = caseInsensitive ? '-i' : '';

      try {
        const grepCmd = `grep -rn ${caseFlag} --include=${globFilter || '*'} "${pattern.replace(/"/g, '\\"')}" "${dir}"`;

        const result = await new Promise<string>((resolve, reject) => {
          exec(grepCmd, {
            maxBuffer: 10 * 1024 * 1024,
            encoding: 'utf-8',
          }, (error, stdout) => {
            if (error && error.code === 1) {
              // grep 返回 1 表示无匹配，不是错误
              resolve('');
            } else if (error) {
              reject(error);
            } else {
              resolve(stdout);
            }
          });
        });

        if (!result.trim()) {
          return `未找到匹配 "${pattern}" 的内容`;
        }

        const lines = result.split('\n').filter(Boolean);
        if (lines.length > max) {
          return lines.slice(0, max).join('\n') + `\n\n[共 ${lines.length} 个匹配，已截断显示前 ${max} 个]`;
        }

        return lines.join('\n');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return `[Error] 搜索失败: ${msg}`;
      }
    },
  });
}

export const grepTool = createGrepTool();
