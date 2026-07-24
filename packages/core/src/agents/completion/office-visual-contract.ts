/**
 * Office PPT visual contract heuristics (data intent, media presence, layout scan).
 * Completion verifier must not invoke officecli — unzip + TaskTrace only.
 */

import type { TaskTrace } from './types.js';
import { extractExpectedSlideCount, inspectPptxZip } from './office-slide-count.js';

export const FAKE_CHART_PREFIX = '[FAKE_CHART]';
export const LAYOUT_ISSUES_PREFIX = '[LAYOUT_ISSUES]';

export type OfficeProgressPhase =
  | 'routed'
  | 'creating'
  | 'adding_slide'
  | 'validating'
  | 'delivering'
  | 'blocked';

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

const DIAGRAM_PATTERNS: RegExp[] = [
  /架构图/,
  /流程图/,
  /时序图/,
  /泳道/,
  /roadmap\s*图/i,
  /org\s*chart/i,
  /\barchitecture\b/i,
  /\bflowchart\b/i,
  /sequence\s*diagram/i,
];

/** Architecture / process diagram intent — not a "simple text deck". */
export function hasDiagramIntent(task: string): boolean {
  if (!task.trim()) return false;
  return DIAGRAM_PATTERNS.some(re => re.test(task));
}

/**
 * Request-side simple deck: explicit ≤3 pages, no data/diagram intent.
 * Unspecified page count is NOT simple (progress only, keep hard gates).
 */
export function isSimpleOfficeDeck(task: string): boolean {
  const expected = extractExpectedSlideCount(task);
  if (expected == null || expected < 1 || expected > 3) return false;
  if (hasDataVisualIntent(task)) return false;
  if (hasDiagramIntent(task)) return false;
  return true;
}

/** Parse "Added slide at /slide[N]" (1-based) from officecli tool output. Prefer last match. */
export function extractAddedSlideIndex(output: unknown): number | undefined {
  const text = safeString(output);
  const matches = [
    ...text.matchAll(/Added slide at \/slide\[(\d+)\]/gi),
  ];
  const fallback = matches.length === 0 ? [...text.matchAll(/\/slide\[(\d+)\]/gi)] : matches;
  if (fallback.length === 0) return undefined;
  const n = Number(fallback[fallback.length - 1][1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Infer progress phase from a tool name + input (bash/officecli heuristics). */

export function inferOfficeProgressPhase(
  toolName: string,
  input: unknown,
): OfficeProgressPhase | null {
  const name = toolName.toLowerCase();
  if (name === 'send-file' || name.includes('send-file') || name.includes('sendfile')) {
    return 'delivering';
  }
  const blob = `${name} ${safeString(input)}`.toLowerCase();
  if (/\bofficecli\b/.test(blob) || /\.pptx\b/.test(blob) || name.includes('office')) {
    if (/\bview\b/.test(blob) || /\bvalidate\b/.test(blob)) return 'validating';
    if (/\bcreate\b/.test(blob)) return 'creating';
    if (/\badd\b/.test(blob) && /\bslide\b/.test(blob)) return 'adding_slide';
    if (/\badd\b/.test(blob)) return 'adding_slide';
  }
  if (name === 'bash' || name === 'shell') {
    if (/\bofficecli\b/.test(blob) && /\bview\b/.test(blob)) return 'validating';
    if (/\bofficecli\b/.test(blob) && /\bcreate\b/.test(blob)) return 'creating';
    if (/\bofficecli\b/.test(blob) && /\badd\b/.test(blob)) return 'adding_slide';
  }
  return null;
}

export function isOfficeRouteProgress(
  scenarioId?: string,
  workerType?: string,
): boolean {
  if (workerType === 'office') return true;
  if (!scenarioId) return false;
  return /office/i.test(scenarioId);
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
