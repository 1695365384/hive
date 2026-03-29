/**
 * Bash 工具 — shell 命令执行
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 支持超时控制、危险命令检查、输出截断。
 */

import { exec } from 'node:child_process';
import { tool, zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import { truncateOutput } from './utils/output-safety.js';
import { isDangerousCommand } from './utils/security.js';

export interface BashToolOptions {
  /** 是否允许执行命令（用于 Agent 权限控制） */
  allowed?: boolean;
}

/** Bash 工具输入 schema */
const bashInputSchema = z.object({
  command: z.string().describe('要执行的 shell 命令'),
  timeout: z.number().optional().describe('超时时间（毫秒），默认 120000（2 分钟）'),
});

export type BashToolInput = z.infer<typeof bashInputSchema>;

/**
 * 创建 Bash 工具
 */
export function createBashTool(options?: BashToolOptions): Tool<BashToolInput, string> {
  return tool({
    description: '在 shell 中执行命令。用于运行脚本、git 操作、构建项目等。返回 stdout 和 stderr 的合并输出。',
    inputSchema: zodSchema(bashInputSchema),
    execute: async ({ command, timeout }): Promise<string> => {
      // 权限检查
      if (options?.allowed === false) {
        return '[Security] 当前 Agent 无权限执行 shell 命令';
      }

      // 危险命令检查
      const danger = isDangerousCommand(command);
      if (danger.dangerous) {
        return `[Security] 阻止危险命令: ${danger.description}\n命令: ${command}`;
      }

      const timeoutMs = timeout ?? 120_000;

      try {
        const result = await new Promise<string>((resolve, reject) => {
          const child = exec(command, {
            timeout: timeoutMs,
            maxBuffer: 10 * 1024 * 1024, // 10MB
            encoding: 'utf-8',
          }, (error, stdout, stderr) => {
            if (error) {
              // 区分超时和其他错误
              if (error.killed) {
                reject(new Error(`命令超时 (${timeoutMs}ms): ${command}`));
              } else {
                resolve(stdout + stderr);
              }
            } else {
              resolve(stdout + stderr);
            }
          });
        });

        return truncateOutput(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return `[Error] 命令执行失败: ${msg}`;
      }
    },
  });
}

/** 默认 Bash 工具实例（全权限） */
export const bashTool = createBashTool({ allowed: true });
