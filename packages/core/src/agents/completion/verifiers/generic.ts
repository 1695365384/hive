/**
 * Generic completion verifier — baseline audit for non-scenario tasks.
 *
 * Prevents "polite fake completion": actionable tasks that finish with
 * empty / promise-only text and zero tool or worker activity.
 *
 * Conversational / Q&A tasks still pass without tools.
 */

import type { CompletionVerifier, TaskTrace, VerifyResult } from '../types.js';

const ACTIONABLE_RE =
  /(实现|修改|创建|修复|重构|编写|生成|添加|删除|更新|部署|安装|配置|排查|调试|改一下|做一[个份]|implement|fix|create|add|remove|update|refactor|debug|build|write|generate|deploy|install|configure|patch)/i;

const ANALYTICAL_RE =
  /(分析|解释|说明|对比|总结|梳理|讲讲|介绍|explain|analyze|summarise|summarize|compare|overview|describe)/i;

const PROMISE_ONLY_RE =
  /(我会|我将|让我来|稍后|接下来我会|马上开始|I will|I'll |Let me |I am going to|I'm going to)/i;

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
