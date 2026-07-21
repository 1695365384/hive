/**
 * Cross-scenario intent helpers
 */

/**
 * User explicitly asked not to generate / create files or Office artifacts.
 * Honor this over office creation routing and office recovery spawns.
 */
export function hasNoArtifactIntent(task: string): boolean {
  const text = task.trim();
  if (!text) return false;

  if (
    /(不要|别|无需|不用|禁止|勿|别再)\s*(生成|创建|产出|写出?|制作|做)\s*(任何)?\s*(文件|文档|附件|PPT|pptx|Word|docx|Excel|xlsx|幻灯片|演示文稿|artifact)/i
      .test(text)
  ) {
    return true;
  }

  if (
    /\b(do\s+not|don't|dont|no)\s+(generate|create|produce|write|make|emit)\b[\s\S]{0,40}\b(files?|docs?|documents?|artifacts?|pptx?|docx?|xlsx?)\b/i
      .test(text)
  ) {
    return true;
  }

  if (
    /\b(no\s+files?(?:\s+please)?|text\s+only|explanation\s+only|answer\s+in\s+text(?:\s+only)?)\b/i
      .test(text)
  ) {
    return true;
  }

  if (/(只|仅)(解释|说明|讲|说|回答|文字)|不要\s*(输出|产生|附带)\s*(文件|附件|文档)/i.test(text)) {
    return true;
  }

  return false;
}
