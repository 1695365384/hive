/**
 * Models.dev 文件持久化适配器
 *
 * 将 models.dev 缓存数据持久化到文件系统
 * 通过注入缓存文件路径，不依赖 workspace 模块
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ModelsDevPersistence } from './models-dev.js';
import type { ModelsDevCache } from './types.js';

/**
 * 文件持久化实现
 *
 * 使用指定路径存储 models.dev 缓存
 */
export class WorkspacePersistence implements ModelsDevPersistence {
  private readonly cacheFilePath: string;

  constructor(cacheFilePath: string) {
    this.cacheFilePath = cacheFilePath;
  }

  /**
   * 从文件加载缓存
   */
  async load(): Promise<ModelsDevCache | null> {
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        return null;
      }

      const content = await fs.promises.readFile(this.cacheFilePath, 'utf-8');
      const cache = JSON.parse(content) as ModelsDevCache;

      if (new Date(cache.expiresAt) <= new Date()) {
        return null;
      }

      return cache;
    } catch {
      return null;
    }
  }

  /**
   * 保存缓存到文件
   */
  async save(cache: ModelsDevCache): Promise<void> {
    const cacheDir = path.dirname(this.cacheFilePath);

    if (!fs.existsSync(cacheDir)) {
      await fs.promises.mkdir(cacheDir, { recursive: true });
    }

    const content = JSON.stringify(cache, null, 2);
    await fs.promises.writeFile(this.cacheFilePath, content, 'utf-8');
  }

  /**
   * 清除缓存文件
   */
  async clear(): Promise<void> {
    if (fs.existsSync(this.cacheFilePath)) {
      await fs.promises.unlink(this.cacheFilePath);
    }
  }

  /**
   * 检查缓存文件是否存在
   */
  exists(): boolean {
    return fs.existsSync(this.cacheFilePath);
  }

  /**
   * 获取缓存文件路径
   */
  getCachePath(): string {
    return this.cacheFilePath;
  }
}

/**
 * 创建文件持久化实例
 */
export function createWorkspacePersistence(cacheFilePath: string): WorkspacePersistence {
  return new WorkspacePersistence(cacheFilePath);
}
