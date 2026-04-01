/**
 * 统一的输出安全工具
 *
 * 所有内置工具共享的输出截断逻辑，防止大输出撑爆上下文窗口。
 */

/** 默认最大输出字符数 */
const DEFAULT_MAX_CHARS = 30_000;

/**
 * 截断输出内容
 *
 * 超过 maxChars 时截断并附加提示信息。
 *
 * @param text - 原始输出文本
 * @param maxChars - 最大字符数，默认 30000
 * @returns 截断后的文本（可能附加截断提示）
 */
export function truncateOutput(text: string, maxChars: number = DEFAULT_MAX_CHARS): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n[Output truncated, ${text.length} characters total]`;
}
