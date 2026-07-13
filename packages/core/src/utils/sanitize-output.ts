/**
 * 清理模型输出中的装饰性 emoji / 符号
 *
 * 用于用户可见的最终回复，不影响工具参数或代码块内的合法 Unicode。
 */

/** Extended_Pictographic + 常见装饰符号（✓✅❌等） */
const DECORATIVE_PATTERN =
  /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}✓✔✅❌⚠️⭐🔥👍👎💡📌🎯🚀]/gu;

/**
 * 移除装饰性 emoji 与符号，合并多余空白
 * @param trim - 是否 trim 首尾空白（流式 chunk 应传 false）
 */
export function stripDecorativeEmoji(text: string, options?: { trim?: boolean }): string {
  if (!text) return text;
  const shouldTrim = options?.trim ?? true;
  let result = text
    .replace(DECORATIVE_PATTERN, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  if (shouldTrim) {
    result = result.trim();
  }
  return result;
}
