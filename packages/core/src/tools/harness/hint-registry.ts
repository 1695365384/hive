/**
 * Hint 模板注册表
 *
 * 按工具分组，按错误码索引。
 * 模板接收 ToolResult.context 填充变量。
 */

import type { HintTemplate, HintTemplateMap } from './types.js';

// ============================================
// file-tool hint 模板
// ============================================

const FILE_HINTS: HintTemplateMap = {
  MATCH_FAILED: (ctx) =>
    `建议: 先用 file view 读取 ${ctx.path ?? '目标文件'} 确认当前内容，` +
    `注意缩进、空格和换行符的差异。` +
    `如果文件内容与预期不符，可能已被其他进程修改。`,

  NOT_FOUND: (ctx) =>
    `建议: 确认路径是否正确，可用 glob 搜索类似文件名。` +
    `如果是新建文件，请使用 file create 命令。` +
    (ctx.path ? ` 目标路径: ${ctx.path}` : ''),

  PERMISSION: (ctx) =>
    `建议: 当前 Agent 类型无此权限（需要: ${ctx.command ?? '未知操作'}）。` +
    `如果是文件写入操作，请使用 general agent 执行。` +
    `如果是 bash 命令，请告知用户手动操作。`,

  PATH_BLOCKED: (ctx) =>
    `建议: 路径 ${ctx.path ?? ''} 不在允许的工作目录内。` +
    `请选择工作空间目录下的路径。`,

  INVALID_PARAM: (ctx) =>
    `建议: 行号 ${ctx.line ?? '?'} 超出范围（文件共 ${ctx.total ?? '?'} 行）。` +
    `请先用 file view 查看文件确认行数。`,

  MATCH_AMBIGUOUS: (ctx) =>
    `建议: 找到 ${ctx.matchCount ?? '多处'} 处匹配，无法确定替换位置。` +
    `请提供更多上下文（如周围的函数名、注释等）使匹配唯一，` +
    `或先用 file view 确认文件内容。`,

  IO_ERROR: (ctx) =>
    `建议: 文件操作失败（${ctx.path ?? ''}）。` +
    `可能是权限问题或磁盘空间不足，请检查后重试。`,

  SENSITIVE_FILE: (ctx) =>
    `建议: 拒绝访问敏感文件（${ctx.description ?? '敏感文件'}）。` +
    `请告知用户手动操作或使用 ask-user 工具请求许可。`,
};

// ============================================
// bash-tool hint 模板
// ============================================

const BASH_HINTS: HintTemplateMap = {
  TIMEOUT: (ctx) =>
    `建议: 命令执行超时（${ctx.timeout ?? '?'}ms）。` +
    `可以尝试增加 timeout 参数或优化命令。`,

  EXEC_ERROR: (ctx) =>
    `建议: 命令执行失败。请检查命令语法和依赖是否安装。` +
    (ctx.command ? ` 命令: ${ctx.command}` : '') +
    `可以先运行简化命令排查问题。`,

  DANGEROUS_CMD: (ctx) =>
    `建议: 命令被安全策略阻止（${ctx.description ?? '危险操作'}）。` +
    `如果确实需要执行，请告知用户。`,

  COMMAND_BLOCKED: () =>
    `建议: 路径形式的命令不允许执行。` +
    `请使用命令名（不带路径）执行。`,
};

// ============================================
// 合并注册表
// ============================================

const ALL_HINTS: HintTemplateMap = { ...FILE_HINTS, ...BASH_HINTS };

/**
 * 根据错误码和上下文获取 hint
 *
 * @returns hint 字符串，如果无对应模板则返回 undefined
 */
export function getHint(
  code: string,
  context: Record<string, unknown> = {},
): string | undefined {
  const template = ALL_HINTS[code];
  if (!template) return undefined;
  return template(context);
}

/**
 * 获取所有 hint 模板（用于 withHarness 默认配置）
 */
export function getAllHintTemplates(): HintTemplateMap {
  return { ...ALL_HINTS };
}

export { FILE_HINTS, BASH_HINTS };
