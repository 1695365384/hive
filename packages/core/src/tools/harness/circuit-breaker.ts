/**
 * BLOCKED 错误熔断器
 *
 * 当工具因安全策略被拦截（BLOCKED 类错误：DANGEROUS_CMD / COMMAND_BLOCKED /
 * SENSITIVE_FILE / UNKNOWN_COMMAND）时，熔断器会：
 *   1. 记录被拦截操作的指纹
 *   2. 若同一指纹在 TTL 内再次触发，追加强力 CIRCUIT OPEN 提示
 *   3. 防止 LLM 在同一会话中反复重试同一被阻止的操作
 *
 * 熔断器是无状态纯函数，通过闭包维护会话内状态。
 * 调用方通过 `createBlockedCircuitBreaker()` 获取与会话绑定的实例。
 */

import { BLOCKED_CODES } from './types.js';

// ============================================
// 内部类型
// ============================================

interface BlockedEntry {
  count: number;
  firstSeen: number;
  lastSeen: number;
}

// ============================================
// 配置
// ============================================

/** 同一操作在 TTL 内触发几次后开始熔断 */
const CIRCUIT_OPEN_THRESHOLD = 1; // 第 2 次触发即开路

/** 熔断记录 TTL（毫秒），超出后视为新操作 */
const CIRCUIT_TTL_MS = 600_000; // 10 分钟

// ============================================
// 工厂
// ============================================

/**
 * 判断错误码是否属于 BLOCKED 类
 */
export function isBlockedCode(code: string): boolean {
  return (BLOCKED_CODES as readonly string[]).includes(code);
}

/**
 * 生成操作指纹，用于识别"相同操作"
 * 对命令名/文件路径做规范化，忽略参数细节以提高命中率
 */
function buildFingerprint(toolName: string, errorCode: string, context: Record<string, unknown> = {}): string {
  const cmd = String(context.command ?? context.path ?? '').split(/[\s/\\]/)[0].toLowerCase();
  return `${toolName}:${errorCode}:${cmd}`.slice(0, 120);
}

/**
 * 创建会话隔离的 BLOCKED 熔断器实例
 */
export function createBlockedCircuitBreaker() {
  const registry = new Map<string, BlockedEntry>();

  /**
   * 记录一次 BLOCKED 事件，并返回是否需要注入熔断提示。
   *
   * @param toolName   - 工具名称
   * @param errorCode  - 错误码（必须是 BLOCKED 类，否则返回 null）
   * @param context    - ToolResult.context，用于生成指纹
   * @returns          熔断提示字符串（需追加到工具结果后），或 null
   */
  function record(
    toolName: string,
    errorCode: string,
    context: Record<string, unknown> = {},
  ): string | null {
    if (!isBlockedCode(errorCode)) return null;

    const fp = buildFingerprint(toolName, errorCode, context);
    const now = Date.now();

    // 清理过期记录
    for (const [key, entry] of registry) {
      if (now - entry.lastSeen > CIRCUIT_TTL_MS) {
        registry.delete(key);
      }
    }

    const entry = registry.get(fp);
    if (!entry) {
      registry.set(fp, { count: 1, firstSeen: now, lastSeen: now });
      return null; // 首次触发，不开路
    }

    entry.count += 1;
    entry.lastSeen = now;

    if (entry.count > CIRCUIT_OPEN_THRESHOLD) {
      return [
        `[CIRCUIT OPEN] This operation has been blocked ${entry.count} times.`,
        'DO NOT retry this same operation — it is permanently blocked by security policy.',
        'Instead: (1) inform the user that this action is restricted, or',
        '(2) suggest a safe alternative approach, or',
        '(3) use the ask-user tool to request manual confirmation.',
      ].join(' ');
    }

    return null;
  }

  /** 清空所有熔断记录（测试用） */
  function reset(): void {
    registry.clear();
  }

  return { record, reset };
}
