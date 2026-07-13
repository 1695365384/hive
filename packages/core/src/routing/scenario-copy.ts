/**
 * 场景文案 — 双语选择与拼装（无 Node 专依赖，可被 UI 子路径 import）
 */

export interface LocalizedLines {
  readonly zh: readonly string[];
  readonly en: readonly string[];
}

/** 按用户输入语言选择 zh / en 段落并 join */
export function pickLocalizedLines(task: string, lines: LocalizedLines): string {
  const isChinese = /[\u4e00-\u9fa5]/.test(task);
  return (isChinese ? lines.zh : lines.en).join('\n');
}
