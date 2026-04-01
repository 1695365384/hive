/**
 * ToolResult 序列化器
 *
 * 将 ToolResult 转换为 LLM 友好的 string。
 * 格式兼容现有 [OK]/[Error]/[Security] 前缀，新增 [Hint] 前缀。
 */

import type { ToolResult, HintTemplateMap } from './types.js';
import { getHintForTool } from './hint-registry.js';
import { BLOCKED_CODES } from './types.js';

/**
 * 序列化 ToolResult 为 string
 *
 * @param result - 工具返回的 ToolResult
 * @param customTemplates - 自定义 hint 模板（合并到默认模板之上）
 * @param toolName - 工具名（用于 hint 查找回退）
 */
export function serializeToolResult(
  result: ToolResult,
  customTemplates?: HintTemplateMap,
  toolName?: string,
): string {
  const prefix = result.ok ? '[OK]' : getSecurityPrefix(result.code);
  const lines: string[] = [];

  if (result.ok) {
    lines.push(`${prefix} ${result.data ?? ''}`.trim());
    return lines.join('\n');
  }

  // 失败
  lines.push(`${prefix} ${result.error ?? 'Unknown error'}`.trim());

  // 生成 hint
  const hint = result.hint ?? resolveHint(result.code, result.context, customTemplates, toolName);
  if (hint) {
    lines.push(`[Hint] ${hint}`);
  }

  return lines.join('\n');
}

function getSecurityPrefix(code: string): string {
  if (code === 'PERMISSION') {
    return '[Permission]';
  }
  if ((BLOCKED_CODES as readonly string[]).includes(code) || code === 'PATH_BLOCKED') {
    return '[Security]';
  }
  return '[Error]';
}

function resolveHint(
  code: string,
  context: Record<string, unknown> | undefined,
  customTemplates?: HintTemplateMap,
  toolName?: string,
): string | undefined {
  // 优先使用自定义模板
  if (customTemplates?.[code]) {
    return customTemplates[code](context ?? {});
  }
  // 回退到按工具查找 hint
  if (toolName) {
    return getHintForTool(toolName, code, context);
  }
  return undefined;
}
