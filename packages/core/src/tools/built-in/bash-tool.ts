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

/** Pattern for direct access to macOS app data containers (covers ~ and absolute paths) */
const APP_DATA_DIR_PATTERN = /(?:~|\/Users\/[^/]+)\/Library\/(?:Group\s+)?Containers\//;

/**
 * Check if a command tries to directly access application data directories.
 * These are typically protected by macOS and should be accessed via scripting interfaces.
 */
function isAppDataAccess(command: string): boolean {
  return APP_DATA_DIR_PATTERN.test(command);
}
import type { ToolResult } from '../harness/types.js';
import { withHarness, type RawTool } from '../harness/with-harness.js';

export interface BashToolOptions {
  /** 是否允许执行命令（用于 Agent 权限控制） */
  allowed?: boolean;
}

/** Bash 工具输入 schema */
const bashInputSchema = z.object({
  command: z.string().describe('Shell command to execute'),
  timeout: z.number().min(1000).max(600000).optional().describe('Timeout in milliseconds, default 120000 (2 min), range 1000-600000'),
});

export type BashToolInput = z.infer<typeof bashInputSchema>;

/**
 * 创建 Bash rawTool（execute → ToolResult）
 *
 * 供 withHarness 包装使用，也供单元测试直接验证 ToolResult。
 */
export function createRawBashTool(options?: BashToolOptions): RawTool<BashToolInput> {
  return {
    description: 'Execute commands in a shell. For running scripts, git operations, building projects, etc. Returns merged stdout and stderr output.',
    inputSchema: zodSchema(bashInputSchema),
    execute: async ({ command, timeout }): Promise<ToolResult> => {
      // 权限检查
      if (options?.allowed === false) {
        return {
          ok: false,
          code: 'PERMISSION',
          error: 'Current agent does not have permission to execute shell commands',
        };
      }

      // 应用数据目录拦截 — 引导使用脚本接口而非直接读数据库
      if (isAppDataAccess(command)) {
        return {
          ok: false,
          code: 'APP_DATA_BLOCKED',
          error: 'Direct access to application data directories is not reliable. macOS protects these paths and the data format may change between versions. Use env(category="native-app") to discover the correct scripting interface (e.g., osascript) for interacting with native applications.',
        };
      }

      // 危险命令检查
      const danger = isDangerousCommand(command);
      if (danger.dangerous) {
        return {
          ok: false,
          code: 'DANGEROUS_CMD',
          error: `Dangerous command blocked: ${danger.description}\nCommand: ${command}`,
          context: { command, description: danger.description },
        };
      }

      // 命令策略检查
      if (!isCommandAllowed(command)) {
        return {
          ok: false,
          code: 'COMMAND_BLOCKED',
          error: `Command blocked by policy: ${command.split(/\s+/)[0]}`,
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
                const timeoutErr = new Error(`Command timed out (${timeoutMs}ms): ${command}`);
                (timeoutErr as any).killed = true;
                reject(timeoutErr);
              } else {
                // 非零退出码：命令执行失败但未超时
                const output = (stdout + stderr).trim();
                const exitMsg = output
                  ? `Command failed (exit code ${error.code ?? '?'}): ${output}`
                  : `Command failed (exit code ${error.code ?? '?'}): ${error.message}`;
                const execErr = new Error(exitMsg);
                (execErr as any).exitCode = error.code;
                (execErr as any).output = output;
                reject(execErr);
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
            error: `Command timed out (${timeoutMs}ms): ${command}`,
            context: { timeout: timeoutMs, command },
          };
        }
        return {
          ok: false,
          code: 'EXEC_ERROR',
          error: `Command failed: ${msg}`,
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
  return withHarness(createRawBashTool(options), { toolName: 'bash-tool' });
}

/** 默认 Bash 工具实例（全权限） */
export const bashTool = createBashTool({ allowed: true });
