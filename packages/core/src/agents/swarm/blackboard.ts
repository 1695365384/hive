/**
 * 共享黑板
 *
 * Agent 间通过读写黑板传递中间产物。
 * 生命周期绑定单次 Swarm 执行。
 */

import type { BlackboardConfig, BlackboardEntry } from './types.js';

/** 默认配置 */
const DEFAULT_MAX_LEN = 4000;
const DEFAULT_KEEP_LEN = 500;

/**
 * 共享黑板
 */
export class Blackboard {
  private data = new Map<string, unknown>();
  private meta = new Map<string, BlackboardEntry>();
  private keyListeners = new Map<string, Set<(value: unknown) => void>>();
  private globalListeners = new Set<(key: string, value: unknown) => void>();
  private readonly maxLen: number;
  private readonly keepLen: number;

  constructor(config: BlackboardConfig = {}) {
    this.maxLen = config.maxLen ?? DEFAULT_MAX_LEN;
    this.keepLen = config.keepLen ?? DEFAULT_KEEP_LEN;
  }

  // ============================================
  // 读写
  // ============================================

  /**
   * 写入值（不可变写入，同一 key 写两次抛错）
   */
  set(key: string, value: unknown): void {
    if (this.data.has(key)) {
      throw new Error(`Blackboard key already exists: ${key}`);
    }

    this.data.set(key, value);

    const str = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
    const truncated = str.length > this.maxLen;
    const storedValue = truncated ? this.truncate(str) : value;

    this.meta.set(key, {
      value: storedValue,
      length: str.length,
      truncated,
    });

    // 触发监听
    this.keyListeners.get(key)?.forEach(fn => fn(storedValue));
    this.globalListeners.forEach(fn => fn(key, storedValue));
  }

  /**
   * 类型安全读取
   *
   * 如果值被裁剪过，返回裁剪后的版本
   */
  get<T>(key: string): T | undefined {
    const entry = this.meta.get(key);
    if (entry) return entry.value as T;
    return this.data.get(key) as T | undefined;
  }

  /**
   * 检查 key 是否存在
   */
  has(key: string): boolean {
    return this.data.has(key);
  }

  /**
   * 清空黑板
   */
  clear(): void {
    this.data.clear();
    this.meta.clear();
    this.keyListeners.clear();
    this.globalListeners.clear();
  }

  // ============================================
  // Prompt 渲染
  // ============================================

  /**
   * 渲染模板变量
   *
   * 支持:
   * - `{task}` — 直接值
   * - `{nodeId}` — 节点原始值
   * - `{nodeId.result}` — 节点 AgentResult.text
   * - `{nodeId.result.truncated}` — 节点裁剪后的文本
   */
  render(template: string): string {
    return template.replace(/\{([\w.]+)\}/g, (_, path: string) => {
      const value = this.resolvePath(path);
      if (value === undefined) {
        return `{${path}}`;
      }

      if (typeof value === 'string') {
        return value.length > this.maxLen
          ? this.truncate(value)
          : value;
      }

      return String(value);
    });
  }

  /**
   * 解析点号路径
   */
  private resolvePath(path: string): unknown {
    const parts = path.split('.');
    const key = parts[0];
    const raw = this.data.get(key);
    if (raw === undefined) return undefined;

    // 没有子路径，返回原始值
    if (parts.length === 1) return raw;

    // 支持 .result 从 AgentResult 中提取 text
    // 支持 .result.truncated 返回裁剪后的文本
    const obj = raw as Record<string, unknown>;
    let current: unknown = obj;

    // 特殊处理：.result 映射到 .text（AgentResult 约定）
    if (parts[1] === 'result' && typeof obj.text === 'string' && parts.length === 2) {
      return obj.text;
    }

    for (let i = 1; i < parts.length; i++) {
      if (current === null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[parts[i]];
    }

    return current;
  }

  // ============================================
  // 裁剪
  // ============================================

  /**
   * 裁剪长值（首 keepLen + 尾 keepLen + 省略标记）
   */
  truncate(value: string): string {
    if (value.length <= this.maxLen) return value;

    const head = value.slice(0, this.keepLen);
    const tail = value.slice(-this.keepLen);
    const omitted = value.length - this.keepLen * 2;

    return `${head}\n\n...(omitted ${omitted} chars)...\n\n${tail}`;
  }

  // ============================================
  // 快照与监听
  // ============================================

  /**
   * 获取黑板摘要快照
   */
  snapshot(): Record<string, BlackboardEntry> {
    return Object.fromEntries(this.meta);
  }

  /**
   * 监听特定 key 的变化
   * @returns 取消监听函数
   */
  on(key: string, listener: (value: unknown) => void): () => void {
    if (!this.keyListeners.has(key)) {
      this.keyListeners.set(key, new Set());
    }
    this.keyListeners.get(key)!.add(listener);
    return () => this.keyListeners.get(key)?.delete(listener);
  }

  /**
   * 监听所有 key 的变化
   * @returns 取消监听函数
   */
  onAny(listener: (key: string, value: unknown) => void): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  /**
   * 获取黑板大小
   */
  get size(): number {
    return this.data.size;
  }
}
