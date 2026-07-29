/**
 * Generic completion verifier — baseline audit for non-scenario tasks.
 *
 * Prevents "polite fake completion": actionable tasks that finish with
 * empty / promise-only text and zero tool or worker activity.
 *
 * Conversational / Q&A tasks still pass without tools.
 * Enumeration tasks (count 1→N) must include the numbers in responseText —
 * bash-only "完成" claims are rejected even when tools ran.
 * Per-line enumeration must be newline-dense (reject space-separated one-liners).
 */

import type { CompletionVerifier, TaskTrace, VerifyResult } from '../types.js';

const ACTIONABLE_RE =
  /(实现|修改|创建|修复|重构|编写|生成|添加|删除|更新|部署|安装|配置|排查|调试|改一下|做一[个份]|implement|fix|create|add|remove|update|refactor|debug|build|write|generate|deploy|install|configure|patch)/i;

const ANALYTICAL_RE =
  /(分析|解释|说明|对比|总结|梳理|讲讲|介绍|explain|analyze|summarise|summarize|compare|overview|describe)/i;

const PROMISE_ONLY_RE =
  /(我会|我将|让我来|稍后|接下来我会|马上开始|I will|I'll |Let me |I am going to|I'm going to)/i;

/** Count / list-numbers tasks — delivery must appear in the user-visible reply. */
const ENUMERATION_RE =
  /(数到|数一数|从\s*\d+\s*[到至]\s*\d+|count\s+from\s+\d+|one\s+(number\s+)?per\s+line|每个数字|逐行输出|不要提前结束)/i;

/** Explicit one-item-per-line delivery (reject space-separated one-liners). */
const PER_LINE_ENUM_RE =
  /(每个数字单独一行|单独一行|逐行输出|one\s+(number\s+)?per\s+line|each\s+(number|digit)\s+on\s+(its\s+)?own\s+line)/i;

function looksLikeQuestion(task: string): boolean {
  const t = task.trim();
  if (/[?？]$/.test(t)) return true;
  return /^(什么|怎么|如何|为何|为什么|是否|能否|可以吗|啥|what|how|why|which|where|when|is |are |can |does |do )/i.test(
    t,
  );
}

function hasWork(trace: TaskTrace): boolean {
  return trace.toolCalls.length > 0 || trace.workerSpawns.length > 0;
}

function isEnumerationTask(task: string): boolean {
  return ENUMERATION_RE.test(task);
}

function requiresPerLineEnumeration(task: string): boolean {
  return PER_LINE_ENUM_RE.test(task);
}

function extractCountRange(task: string): { start: number; end: number } | null {
  const fromTo =
    task.match(/从\s*(\d+)\s*[到至]\s*(\d+)/) ||
    task.match(/count\s+from\s+(\d+)\s+to\s+(\d+)/i) ||
    task.match(/(\d+)\s*[到至~～\-–—]\s*(\d+)/);
  if (fromTo) {
    const start = Number(fromTo[1]);
    const end = Number(fromTo[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 10_000) {
      return { start, end };
    }
  }
  const countTo = task.match(/数到\s*(\d+)/);
  if (countTo) {
    const end = Number(countTo[1]);
    if (Number.isFinite(end) && end >= 1 && end <= 10_000) {
      return { start: 1, end };
    }
  }
  return null;
}

/** Collect standalone integers that look like enumeration lines (newline-only). */
function extractStrictNumberLines(text: string): number[] {
  const out: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)$/);
    if (m) out.push(Number(m[1]));
  }
  return out;
}

/** Collect standalone integers that look like enumeration lines. */
function extractNumberLines(text: string, opts: { strictLines?: boolean } = {}): number[] {
  const out = extractStrictNumberLines(text);
  if (opts.strictLines) return out;
  // Also accept space/comma-separated runs of digits (compact dumps) when not per-line.
  if (out.length < 5) {
    for (const m of text.matchAll(/(?:^|[\s,，])(\d+)(?=[\s,，]|$)/g)) {
      out.push(Number(m[1]));
    }
  }
  return out;
}

function responseCoversEnumeration(
  text: string,
  start: number,
  end: number,
  opts: { strictLines?: boolean } = {},
): boolean {
  const nums = extractNumberLines(text, opts);
  if (nums.length === 0) return false;
  const set = new Set(nums);
  const expected = end - start + 1;
  let found = 0;
  for (let i = start; i <= end; i++) {
    if (set.has(i)) found++;
  }
  if (expected <= 40) {
    return found >= Math.ceil(expected * 0.8) && set.has(start) && set.has(end);
  }
  // Large ranges: require endpoints + a solid sample (tools may dump the rest).
  return set.has(start) && set.has(end) && found >= 40;
}

/**
 * Per-line tasks: reject dense one-liners / claim-only text with almost no newlines.
 * Require enough newline-isolated number lines relative to the requested range.
 */
function verifyPerLineDensity(
  task: string,
  text: string,
  range: { start: number; end: number } | null,
): VerifyResult | null {
  if (!requiresPerLineEnumeration(task)) return null;

  const strictLines = extractStrictNumberLines(text);
  const expected = range ? range.end - range.start + 1 : 30;
  const minLines =
    expected <= 40 ? Math.ceil(expected * 0.8) : Math.min(24, Math.ceil(expected * 0.12));

  const newlineCount = (text.match(/\n/g) || []).length;
  if (newlineCount < Math.max(3, Math.floor(minLines * 0.5)) || strictLines.length < minLines) {
    return {
      verifierId: 'generic',
      passed: false,
      message:
        'Per-line enumeration requires one number per line in the reply (space-separated one-liners / claim-only text are not enough).',
      retryable: true,
    };
  }
  return null;
}

function verifyEnumeration(trace: TaskTrace, text: string): VerifyResult {
  const range = extractCountRange(trace.task);
  const densityFail = verifyPerLineDensity(trace.task, text, range);
  if (densityFail) return densityFail;

  const strict = requiresPerLineEnumeration(trace.task);
  if (range) {
    if (!responseCoversEnumeration(text, range.start, range.end, { strictLines: strict })) {
      return {
        verifierId: 'generic',
        passed: false,
        message: `Enumeration task requires listing numbers ${range.start}…${range.end} in the reply (claim-only / tools-only output is not enough).`,
        retryable: true,
      };
    }
    return {
      verifierId: 'generic',
      passed: true,
      message: 'Enumeration delivery check passed.',
    };
  }
  // Enumeration-like wording without a clear range: require many number lines.
  const nums = extractNumberLines(text, { strictLines: strict });
  if (nums.length < 10) {
    return {
      verifierId: 'generic',
      passed: false,
      message:
        'Enumeration-like task finished without a substantial numeric list in the reply.',
      retryable: true,
    };
  }
  return {
    verifierId: 'generic',
    passed: true,
    message: 'Enumeration delivery check passed (numeric list present).',
  };
}

export const genericCompletionVerifier: CompletionVerifier = {
  id: 'generic',

  match(): boolean {
    return true;
  },

  verify(trace: TaskTrace): VerifyResult {
    const text = (trace.responseText || '').trim();
    const worked = hasWork(trace);

    if (!text && !worked) {
      return {
        verifierId: 'generic',
        passed: false,
        message: 'Empty response with no tool/worker activity.',
        retryable: true,
      };
    }

    // Count / list tasks: never soft-pass on tools alone or short "完成" claims.
    if (isEnumerationTask(trace.task)) {
      return verifyEnumeration(trace, text);
    }

    const actionable = ACTIONABLE_RE.test(trace.task);
    const analytical = ANALYTICAL_RE.test(trace.task);
    const question = looksLikeQuestion(trace.task);

    // Greetings / Q&A / non-actionable chat: allow text-only answers.
    if (!actionable || question) {
      if (!text && !worked) {
        return {
          verifierId: 'generic',
          passed: false,
          message: 'Empty response.',
          retryable: true,
        };
      }
      return {
        verifierId: 'generic',
        passed: true,
        message: 'Conversational task; no delivery audit required.',
      };
    }

    // Actionable task with real tool/worker activity → pass baseline.
    if (worked) {
      return {
        verifierId: 'generic',
        passed: true,
        message: 'Generic delivery check passed (tools/workers observed).',
      };
    }

    // Analytical actionable wording without tools: accept substantive text.
    if (analytical && text.length >= 80) {
      return {
        verifierId: 'generic',
        passed: true,
        message: 'Analytical answer without tools accepted.',
      };
    }

    if (text.length < 40 || PROMISE_ONLY_RE.test(text.slice(0, 160))) {
      return {
        verifierId: 'generic',
        passed: false,
        message:
          'Actionable task finished without tools/workers; response looks like a promise instead of delivery.',
        retryable: true,
      };
    }

    if (text.length < 120) {
      return {
        verifierId: 'generic',
        passed: false,
        message:
          'Actionable task produced a short answer without any tool/worker activity.',
        retryable: true,
      };
    }

    // Long text-only answer on actionable task: soft-pass to avoid false blocks
    // on pure-reasoning requests that still used action verbs.
    return {
      verifierId: 'generic',
      passed: true,
      message: 'Generic delivery check passed (substantive text-only answer).',
    };
  },
};
