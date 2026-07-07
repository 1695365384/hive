/**
 * 工具结果卸载压缩策略（L0）
 *
 * 将单条内容超过阈值 Token 数的消息卸载到文件系统，
 * 只在消息中保留文件路径 + 预览。
 *
 * 零 LLM 成本（只涉及文件 I/O，不涉及 LLM 调用）
 *
 * 特性：
 *  - 自动清理过期文件（TTL）
 *  - 序列化文件命名
 *  - 预览保留语义上下文
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Message } from '../../session/types.js';
import type { CompressionStrategy, CompressionContext, CompressionStrategyName } from '../types.js';
import { DEFAULT_OFFLOAD_CONFIG } from '../types.js';
import type { OffloadConfig } from '../types.js';
import { createTokenCounter } from '../TokenCounter.js';

/**
 * 工具结果卸载策略实现
 */
export class ToolResultOffloadStrategy implements CompressionStrategy {
  readonly name: CompressionStrategyName = 'offload';
  private readonly config: OffloadConfig;
  private readonly tokenCounter = createTokenCounter();
  private offloadSequence = 0;

  constructor(config?: Partial<OffloadConfig>) {
    this.config = { ...DEFAULT_OFFLOAD_CONFIG, ...config };
  }

  /**
   * 判断是否需要压缩
   */
  shouldCompress(context: CompressionContext): boolean {
    return context.currentTokens > context.threshold;
  }

  /**
   * 执行压缩
   *
   * 对每条消息，如果其内容 Token 数超过阈值，
   * 将完整内容写入文件，消息体替换为预览 + 文件路径。
   *
   * 每次压缩前自动清理过期文件。
   */
  async compress(
    messages: Message[],
    _context: CompressionContext,
  ): Promise<{ messages: Message[]; tokensSaved: number }> {
    // 每次压缩前清理过期文件
    await this.cleanupExpiredFiles().catch(() => {});

    const originalTokens = this.tokenCounter.countMessages(messages);
    const offloadedMessages: Message[] = [];
    let totalSaved = 0;

    for (const msg of messages) {
      const contentTokens = this.tokenCounter.count(msg.content);

      if (contentTokens > this.config.maxToolResultTokens) {
        const fileName = await this.writeOffloadFile(msg);
        const preview = this.makePreview(msg.content);

        offloadedMessages.push({
          ...msg,
          content: `[Large content saved to: ${fileName}]\n\n${preview}`,
        });

        const newContent = `[Large content saved to: ${fileName}]\n\n${preview}`;
        const newTokens = this.tokenCounter.count(newContent);

        totalSaved += contentTokens - newTokens;
      } else {
        offloadedMessages.push(msg);
      }
    }

    const tokensSaved = totalSaved > 0 ? totalSaved : 0;
    return { messages: offloadedMessages, tokensSaved };
  }

  // ============================================
  // TTL 清理
  // ============================================

  /**
   * 清理超过 maxOffloadAgeMs 的过期卸载文件
   */
  async cleanupExpiredFiles(): Promise<number> {
    if (this.config.maxOffloadAgeMs <= 0) return 0; // 不过期

    let cleanedCount = 0;
    try {
      const dir = this.config.offloadDir;
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);

      const now = Date.now();
      for (const entry of entries) {
        if (!entry.isFile()) continue;

        const filePath = path.join(dir, entry.name);
        try {
          const stat = await fs.stat(filePath);
          if (now - stat.mtimeMs > this.config.maxOffloadAgeMs) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        } catch {
          // 跳过无法访问的文件
        }
      }
    } catch {
      // 目录不存在或被拒绝访问，忽略
    }

    return cleanedCount;
  }

  /**
   * 主动清理所有卸载文件
   */
  async cleanupAll(): Promise<number> {
    let cleanedCount = 0;
    try {
      const dir = this.config.offloadDir;
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        try {
          await fs.unlink(path.join(dir, entry.name));
          cleanedCount++;
        } catch {
          // 跳过无法删除的文件
        }
      }
    } catch {
      // 目录不存在或被拒绝访问，忽略
    }

    return cleanedCount;
  }

  // ============================================
  // 内部工具
  // ============================================

  /**
   * 生成内容预览（前 N 行）
   */
  private makePreview(content: string): string {
    const lines = content.split('\n');
    const previewLines = lines.slice(0, this.config.previewLines);
    const remaining = lines.length - this.config.previewLines;
    const preview = previewLines.join('\n');
    return remaining > 0
      ? `${preview}\n\n... (${remaining} more lines, full content saved to file)`
      : preview;
  }

  /**
   * 写入卸载文件
   */
  private async writeOffloadFile(msg: Message): Promise<string> {
    this.offloadSequence++;
    const dir = this.config.offloadDir;
    const timestamp = Date.now();
    const fileName = `msg-${msg.role}-${timestamp}-${this.offloadSequence}.txt`;

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, fileName),
      `Role: ${msg.role}\nTimestamp: ${msg.timestamp?.toISOString() ?? 'N/A'}\n\n${msg.content}`,
      'utf-8',
    );

    return `${dir}/${fileName}`;
  }
}

/**
 * 创建工具结果卸载策略实例
 */
export function createToolResultOffloadStrategy(config?: Partial<OffloadConfig>): ToolResultOffloadStrategy {
  return new ToolResultOffloadStrategy(config);
}
