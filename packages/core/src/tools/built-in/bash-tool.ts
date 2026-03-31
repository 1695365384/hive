/**
 * Bash 工具 — shell 命令执行
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 支持超时控制、危险命令检查、输出截断。
 *
 * 内层 rawTool 返回 ToolResult（结构化），外层 createBashTool 返回 string（AI SDK 兼容）。
 */

import { exec } from 'node:child_process';
import { tool, zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import { truncateOutput } from './utils/output-safety.js';
import { isDangerousCommand, isCommandAllowed } from './utils/security.js';
import type { ToolResult } from '../harness/types.js';
import { withHarness, type RawTool } from '../harness/with-harness.js';

export interface BashToolOptions {
  /** 是否允许执行命令（用于 Agent 权限控制） */
  allowed?: boolean;
}

/** Bash 工具输入 schema */
const bashInputSchema = z.object({
  command: z.string().describe('要执行的 shell 命令'),
  timeout: z.number().min(1000).max(600000).optional().describe('超时时间（毫秒），默认 120000（2 分钟），范围 1000-600000'),
});

export type BashToolInput = z.infer<typeof bashInputSchema>;

/**
 * 创建 Bash rawTool（execute → ToolResult）
 *
 * 供 withHarness 包装使用，也供单元测试直接验证 ToolResult。
 */
export function createRawBashTool(options?: BashToolOptions): RawTool<BashToolInput> {
  return {
    description: '在 shell 中执行命令。用于运行脚本、git 操作、构建项目等。返回 stdout 和 stderr 的合并输出。',
    inputSchema: zodSchema(bashInputSchema),
    execute: async ({ command, timeout }): Promise<ToolResult> => {
      // 权限检查
      if (options?.allowed === false) {
        return {
          ok: false,
          code: 'PERMISSION',
          error: '当前 Agent 无权限执行 shell 命令',
        };
      }

      // 危险命令检查
      const danger = isDangerousCommand(command);
      if (danger.dangerous) {
        return {
          ok: false,
          code: 'DANGEROUS_CMD',
          error: `阻止危险命令: ${danger.description}\n命令: ${command}`,
          context: { command, description: danger.description },
        };
      }

      // 命令策略检查
      if (!isCommandAllowed(command)) {
        return {
          ok: false,
          code: 'COMMAND_BLOCKED',
          error: `命令被策略阻止: ${command.split(/\s+/)[0]}`,
          context: { command },
        };
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
              if ('killed' in error && error.killed) {
                const timeoutErr = new Error(`命令超时 (${timeoutMs}ms): ${command}`);
                (timeoutErr as any).killed = true;
                reject(timeoutErr);
              } else {
                resolve(stdout + stderr);
              }
            } else {
              resolve(stdout + stderr);
            }
          });
        });

        return {
          ok: true,
          code: 'OK',
          data: truncateOutput(result),
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const isKilled = error instanceof Error && 'killed' in error && (error as any).killed;
        if (isKilled) {
          return {
            ok: false,
            code: 'TIMEOUT',
            error: `命令超时 (${timeoutMs}ms): ${command}`,
            context: { timeout: timeoutMs, command },
          };
        }
        return {
          ok: false,
          code: 'EXEC_ERROR',
          error: `命令执行失败: ${msg}`,
          context: { command },
        };
      }
    },
  };
}

/**
 * 创建 Bash 工具（AI SDK 兼容，execute → string）
 *
 * 内部使用 createRawBashTool + withHarness 包装。
 */
export function createBashTool(options?: BashToolOptions): Tool<BashToolInput, string> {
  return withHarness(createRawBashTool(options));
}

/** 默认 Bash 工具实例（全权限） */
export const bashTool = createBashTool({ allowed: true });
