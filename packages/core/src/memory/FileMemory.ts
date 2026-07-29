/**
 * FileMemory — 文件型持久记忆存储（legacy / fallback）
 *
 * 以纯文本文件存储每个用户的记忆，路径为：
 *   {workspaceDir}/.hive/memories/{userId}.md
 *
 * Prefer {@link MnemopiMemory} on the Desktop/Server hot path.
 */

import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PersistentMemory } from './types.js';

export class FileMemory implements PersistentMemory {
  private baseDir: string;

  /**
   * @param workspaceDir 工作空间根目录（如 ServerImpl 的 workspaceManager.getRootPath()）
   */
  constructor(workspaceDir: string) {
    this.baseDir = resolve(workspaceDir, '.hive', 'memories');
  }

  private getPath(userId: string): string {
    return resolve(this.baseDir, `${userId}.md`);
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.baseDir)) {
      await mkdir(this.baseDir, { recursive: true });
    }
  }

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

  async appendMemory(userId: string, content: string): Promise<void> {
    await this.ensureDir();
    const filePath = this.getPath(userId);
    const timestamp = new Date().toISOString();
    const entry = `\n## ${timestamp}\n\n${content.trim()}\n`;
    await appendFile(filePath, entry, 'utf-8');
  }
}
