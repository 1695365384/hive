/**
 * FileMemory — 文件型持久记忆存储
 *
 * 以纯文本文件存储每个用户的记忆，路径为：
 *   {workspaceDir}/.hive/memories/{userId}.md
 *
 * 设计原则：
 * - 简单透明：纯 Markdown 文件，可读可写
 * - 无外部依赖：只使用 node:fs/promises
 * - 按用户隔离：每个用户一个独立文件
 */

import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export class FileMemory {
  private baseDir: string;

  /**
   * @param workspaceDir 工作空间根目录（如 ServerImpl 的 workspaceManager.getRootPath()）
   */
  constructor(workspaceDir: string) {
    this.baseDir = resolve(workspaceDir, '.hive', 'memories');
  }

  /**
   * 获取某个用户的记忆文件路径
   */
  private getPath(userId: string): string {
    return resolve(this.baseDir, `${userId}.md`);
  }

  /**
   * 确保记忆目录存在
   */
  private async ensureDir(): Promise<void> {
    if (!existsSync(this.baseDir)) {
      await mkdir(this.baseDir, { recursive: true });
    }
  }

  /**
   * 读取用户记忆
   *
   * @param userId 用户 ID
   * @returns 记忆内容（文件不存在时返回空字符串）
   */
  async readMemory(userId: string): Promise<string> {
    try {
      const filePath = this.getPath(userId);
      return await readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return '';
      }
      throw error;
    }
  }

  /**
   * 追加内容到用户记忆文件
   *
   * @param userId 用户 ID
   * @param content 要追加的内容（自动添加换行）
   */
  async appendMemory(userId: string, content: string): Promise<void> {
    await this.ensureDir();
    const filePath = this.getPath(userId);
    const timestamp = new Date().toISOString();
    const entry = `\n## ${timestamp}\n\n${content.trim()}\n`;
    await appendFile(filePath, entry, 'utf-8');
  }
}
