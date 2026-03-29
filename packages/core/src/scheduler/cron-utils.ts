/**
 * Cron 工具函数
 *
 * 提供 cron 表达式验证和下次执行时间计算
 */

import { validate as cronValidate } from 'node-cron';
import type { ScheduleKind } from './types.js';

/**
 * 计算下次执行时间（毫秒时间戳）
 * 支持三种调度模式：cron、every、at
 */
export function computeNextRunAtMs(params: {
  scheduleKind: ScheduleKind;
  cron?: string;
  intervalMs?: number;
  runAt?: string;
}): number | undefined {
  switch (params.scheduleKind) {
    case 'cron': {
      if (!params.cron || !isValidCron(params.cron)) return undefined;
      const next = getNextRunTime(params.cron);
      return next?.getTime();
    }
    case 'every': {
      if (!params.intervalMs || params.intervalMs <= 0) return undefined;
      return Date.now() + params.intervalMs;
    }
    case 'at': {
      if (!params.runAt) return undefined;
      const target = new Date(params.runAt).getTime();
      if (target <= Date.now()) return undefined; // 已过期
      return target;
    }
    default:
      return undefined;
  }
}

/**
 * 验证 cron 表达式是否有效
 */
export function isValidCron(expression: string): boolean {
  return cronValidate(expression);
}

/**
 * 将绝对时间戳转换为 cron 表达式（5 字段格式）
 * 用于将 at/every 的绝对时间转换为可注册的 cron 表达式
 */
export function timestampToCron(ts: number): string {
  const d = new Date(ts);
  const minute = d.getMinutes();
  const hour = d.getHours();
  const day = d.getDate();
  const month = d.getMonth() + 1;
  // day-of-week 使用 *（不限制），因为我们用绝对日期
  return `${minute} ${hour} ${day} ${month} *`;
}

/**
 * 获取 cron 表达式的下次执行时间
 * 通过临时调度获取下次触发时间
 */
export function getNextRunTime(cronExpression: string): Date | null {
  if (!isValidCron(cronExpression)) {
    return null;
  }

  try {
    return estimateNextRun(cronExpression);
  } catch {
    return null;
  }
}

/**
 * 估算 cron 下次执行时间
 * 基于当前时间和 cron 字段推算
 */
function estimateNextRun(cronExpression: string): Date {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return new Date();
  }

  const [minute, hour, dom, month, dow] = parts;
  const now = new Date();
  const next = new Date(now);

  // 尝试找到一个未来的匹配时间
  // 简单实现：在接下来的 366 天内查找匹配
  for (let dayOffset = 0; dayOffset < 366; dayOffset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + dayOffset);

    // 如果不是第一天，重置时分秒
    if (dayOffset > 0) {
      candidate.setHours(0, 0, 0, 0);
    }

    if (matchesCron(candidate, minute, hour, dom, month, dow)) {
      // 找到匹配的日期，设置具体时间
      const hourVal = resolveCronField(candidate.getHours(), hour);
      const minuteVal = resolveCronField(0, minute);

      if (dayOffset === 0 && candidate <= now) {
        // 今天但已过时间，检查下一个分钟
        continue;
      }

      candidate.setHours(hourVal, minuteVal, 0, 0);
      if (candidate > now) {
        return candidate;
      }
    }
  }

  return next;
}

/**
 * 检查日期是否匹配 cron 字段
 */
function matchesCron(
  date: Date,
  minute: string,
  hour: string,
  dom: string,
  month: string,
  dow: string
): boolean {
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const w = date.getDay();

  return (
    matchesField(month, m) &&
    matchesField(dom, d) &&
    matchesField(dow, w === 0 ? 7 : w)
  );
}

/**
 * 检查值是否匹配 cron 字段
 */
function matchesField(field: string, value: number): boolean {
  if (field === '*') return true;

  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [range, step] = part.split('/');
      const stepNum = parseInt(step, 10);
      const start = range === '*' ? 0 : parseInt(range, 10);
      if ((value - start) % stepNum === 0 && value >= start) return true;
    } else if (part.includes('-')) {
      const [min, max] = part.split('-').map(Number);
      if (value >= min && value <= max) return true;
    } else {
      if (parseInt(part, 10) === value) return true;
    }
  }

  return false;
}

/**
 * 解析 cron 字段为具体值（取第一个匹配）
 */
function resolveCronField(_current: number, field: string): number {
  if (field === '*') return 0;
  const first = field.split(',')[0];
  if (first.includes('/')) return parseInt(first.split('/')[0] === '*' ? '0' : first.split('/')[0], 10);
  if (first.includes('-')) return parseInt(first.split('-')[0], 10);
  return parseInt(first, 10);
}
