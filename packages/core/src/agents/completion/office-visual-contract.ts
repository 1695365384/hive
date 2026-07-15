/**
 * Office PPT visual contract heuristics (data intent, media presence, layout scan).
 * Completion verifier must not invoke officecli — unzip + TaskTrace only.
 */

import type { TaskTrace } from './types.js';
import { inspectPptxZip } from './office-slide-count.js';

export const FAKE_CHART_PREFIX = '[FAKE_CHART]';
export const LAYOUT_ISSUES_PREFIX = '[LAYOUT_ISSUES]';

/** Positive: task needs chart or embedded picture in the deck */
const POSITIVE_PATTERNS: RegExp[] = [
  /图表/,
  /\bchart\b/i,
  /数据/,
  /\bKPI\b/i,
  /同比/,
  /环比/,
  /趋势/,
  /占比/,
  /柱状/,
  /折线/,
  /饼图/,
  /对比/,
  /增长/,
  /百分点/,
  /\brevenue\b/i,
  /\bmetrics?\b/i,
];

/** Negative phrases win over positive substring matches */
const NEGATIVE_PATTERNS: RegExp[] = [
  /纯文字提纲/,
  /议程/,
  /标题页/,
  /会议纪要大纲/,
  /无数据/,
  /文字版/,
];

const LAYOUT_ISSUE_RE =
  /\b(overlap|collision|overlapping)\b|重叠|遮挡|互相覆盖|layout\s*issue/i;

function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * View-like call: require officecli view in the *input* (or a tool named *view*).
 * Do not infer from output text alone — avoids false LAYOUT fails.
 */
function isViewRelatedCall(toolName: string, input: unknown, _output: unknown): boolean {
  const name = toolName.toLowerCase();
  if (/(^|[^a-z])view([^a-z]|$)/i.test(name) || name.endsWith('view')) return true;
  const inp = safeString(input).toLowerCase();
  return /\bofficecli\b/.test(inp) && /\bview\b/.test(inp);
}

export function hasDataVisualIntent(task: string): boolean {
  if (!task.trim()) return false;
  if (NEGATIVE_PATTERNS.some(re => re.test(task))) return false;
  return POSITIVE_PATTERNS.some(re => re.test(task));
}

/**
 * true = chart or picture part present; false = inspected, none;
 * null = could not inspect (unzip failed).
 */
export async function pptxHasVisualMedia(filePath: string): Promise<boolean | null> {
  const info = await inspectPptxZip(filePath);
  if (!info.ok) return null;
  return info.hasChart || info.hasMedia;
}

/** Whether LAYOUT gate should run (had view-like tool output to scan). */
export function hasScannableViewOutput(trace: TaskTrace): boolean {
  return trace.toolCalls.some(call => {
    if (!isViewRelatedCall(call.toolName, call.input, call.output)) return false;
    return safeString(call.output).trim().length > 0;
  });
}

/** Return matched issue token, or null if no issue / nothing to scan. */
export function findLayoutIssueInTrace(trace: TaskTrace): string | null {
  if (!hasScannableViewOutput(trace)) return null;
  for (const call of trace.toolCalls) {
    if (!isViewRelatedCall(call.toolName, call.input, call.output)) continue;
    const text = safeString(call.output);
    if (LAYOUT_ISSUE_RE.test(text)) {
      return text.match(LAYOUT_ISSUE_RE)?.[0] ?? 'layout issue';
    }
  }
  return null;
}
