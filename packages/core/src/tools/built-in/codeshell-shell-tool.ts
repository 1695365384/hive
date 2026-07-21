/**
 * CodeShell Shell 工具 — 基于 @cjhyy/code-shell-core 的跨平台 shell 执行
 *
 * 使用 CodeShell 的 Bash/PowerShell 内置工具实现跨平台 shell 命令执行：
 * - Windows: PowerShell
 * - Unix (macOS/Linux): Bash
 *
 * 保留 hive 的安全层：危险命令检查、命令策略、应用数据目录拦截、输出截断。
 * 对 Agent 透明：工具名仍为 'bash'，输入 schema 与原 bash-tool 一致。
 */

import os from 'node:os';
import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import { BUILTIN_TOOLS } from '@cjhyy/code-shell-core';
import { truncateOutput } from './utils/output-safety.js';
import { isDangerousCommand, isCommandAllowed } from './utils/security.js';
import { getWorkingDirectory } from '../../workspace/session-fs.js';
import type { ToolResult } from '../harness/types.js';
import { withHarness } from '../harness/with-harness.js';
import type { RawTool } from '../harness/with-harness.js';

// ============================================
// CodeShell 内置工具查找
// ============================================

/**
 * CodeShell 内置工具的最小类型描述。
 * 实际类型由 @cjhyy/code-shell-core 的 .d.ts 提供，
 * 此处仅声明我们用到的结构，避免类型不匹配。
 */
interface CodeShellBuiltinTool {
  definition: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  };
  execute: (
    args: Record<string, unknown>,
    ctx?: Record<string, unknown>,
  ) => Promise<string | { result: string; [key: string]: unknown }>;
}

/** 从 BUILTIN_TOOLS 中按名称查找工具 */
function findBuiltinTool(name: string): CodeShellBuiltinTool {
  const found = BUILTIN_TOOLS.find((t) => t.definition.name === name);
  if (!found) {
    throw new Error(
      `CodeShell builtin tool "${name}" not found. Check @cjhyy/code-shell-core version.`,
    );
  }
  return found as CodeShellBuiltinTool;
}

// 模块加载时预查找，避免每次调用都搜索
const csBashTool = findBuiltinTool('Bash');
const csPowerShellTool = findBuiltinTool('PowerShell');

// ============================================
// 工具定义
// ============================================

/** macOS app data 目录访问拦截（与原 bash-tool 一致） */
const APP_DATA_DIR_PATTERN =
  /(?:~|\/Users\/[^/]+)\/Library\/(?:Group\s+)?Containers\//;

function isAppDataAccess(command: string): boolean {
  return APP_DATA_DIR_PATTERN.test(command);
}

/** 工具输入 schema — 与原 bash-tool 完全一致，对 Agent 透明 */
const shellInputSchema = z.object({
  command: z.string().describe('Shell command to execute'),
  timeout: z
    .number()
    .min(1000)
    .max(600000)
    .optional()
    .describe(
      'Timeout in milliseconds, default 120000 (2 min), range 1000-600000',
    ),
});

export type CodeShellShellToolInput = z.infer<typeof shellInputSchema>;

export interface CodeShellShellToolOptions {
  /** 是否允许执行命令（用于 Agent 权限控制） */
  allowed?: boolean;
}

// ============================================
// RawTool 实现
// ============================================

/**
 * 创建原始工具（execute → ToolResult，不经 harness）
 *
 * 安全层与原 bash-tool 一致：
 * 1. 权限检查
 * 2. 应用数据目录拦截
 * 3. 危险命令检查
 * 4. 命令策略检查
 *
 * 执行层替换为 CodeShell：
 * - Windows → PowerShell 工具
 * - Unix → Bash 工具
 */
export function createRawCodeShellShellTool(
  options?: CodeShellShellToolOptions,
): RawTool<CodeShellShellToolInput> {
  return {
    description:
      'Execute commands in a shell. For running scripts, git operations, building projects, etc. Returns merged stdout and stderr output. CRITICAL: Control output size — always use head, tail, wc -l, or --limit to avoid massive output. Never cat large files or run commands that may produce unbounded output.',
    inputSchema: zodSchema(shellInputSchema),
    execute: async ({ command, timeout }): Promise<ToolResult> => {
      // 1. 权限检查
      if (options?.allowed === false) {
        return {
          ok: false,
          code: 'PERMISSION',
          error:
            'Current agent does not have permission to execute shell commands',
        };
      }

      // 2. 应用数据目录拦截
      if (isAppDataAccess(command)) {
        return {
          ok: false,
          code: 'APP_DATA_BLOCKED',
          error:
            'Direct access to application data directories is not reliable. macOS protects these paths and the data format may change between versions. Use env(category="native-app") to discover the correct scripting interface (e.g., osascript) for interacting with native applications.',
        };
      }

      // 3. 危险命令检查
      const danger = isDangerousCommand(command);
      if (danger.dangerous) {
        return {
          ok: false,
          code: 'DANGEROUS_CMD',
          error: `Dangerous command blocked: ${danger.description}\nCommand: ${command}`,
          context: { command, description: danger.description },
        };
      }

      // 4. 命令策略检查
      if (!isCommandAllowed(command)) {
        return {
          ok: false,
          code: 'COMMAND_BLOCKED',
          error: `Command blocked by policy: ${command.split(/\s+/)[0]}`,
          context: { command },
        };
      }

      const timeoutMs = timeout ?? 120_000;

      // 跨平台选择 CodeShell shell 工具
      const isWindows = os.platform() === 'win32';
      const csTool = isWindows ? csPowerShellTool : csBashTool;

      try {
        const csArgs: Record<string, unknown> = { command };
        if (timeout) {
          csArgs.timeout = timeout;
        }

        const csCtx: Record<string, unknown> = {
          cwd: getWorkingDirectory(),
          signal: AbortSignal.timeout(timeoutMs),
        };

        const result = await csTool.execute(csArgs, csCtx);

        // CodeShell 工具返回 string 或 { result: string, ... }
        const output =
          typeof result === 'string'
            ? result
            : (result as { result?: string }).result ?? String(result);

        // 检查 spawn 级别失败（shell 二进制不存在等）
        if (output.startsWith('Failed to spawn')) {
          return {
            ok: false,
            code: 'EXEC_ERROR',
            error: output,
            context: { command },
          };
        }

        return {
          ok: true,
          code: 'OK',
          data: truncateOutput(output, 40000),
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
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

// ============================================
// AI SDK 兼容包装
// ============================================

/**
 * 创建 CodeShell shell 工具（AI SDK 兼容，execute → string）
 *
 * 内部使用 withHarness 包装 rawTool 逻辑。
 * toolName 保持 'bash-tool' 以复用现有的 hint 模板。
 */
export function createCodeShellShellTool(
  options?: CodeShellShellToolOptions,
): Tool<CodeShellShellToolInput, string> {
  return withHarness(createRawCodeShellShellTool(options), {
    toolName: 'bash-tool',
  });
}

/** 默认 shell 工具实例（全权限） */
export const codeShellShellTool = createCodeShellShellTool({
  allowed: true,
});
