/**
 * Models.dev 工作空间持久化适配器
 *
 * 将 models.dev 缓存数据持久化到工作空间
 */

import * as fs from 'fs';
import * as path from 'path';
import type { WorkspaceManager } from '../../workspace/index.js';
import type { ModelsDevCache } from '../../workspace/types.js';
import type { ModelsDevPersistence } from './models-dev.js';

/**
 * 工作空间持久化实现
 *
 * 使用工作空间目录存储 models.dev 缓存
 */
export class WorkspacePersistence implements ModelsDevPersistence {
  constructor(private workspace: WorkspaceManager) {}

  /**
   * 从工作空间加载缓存
   */
  async load(): Promise<ModelsDevCache | null> {
    const filePath = this.workspace.getPaths().modelsDevCacheFile;
    try {
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = await fs.promises.readFile(filePath, 'utf-8');
      const cache = JSON.parse(content) as ModelsDevCache;

      // 检查是否过期
      if (new Date(cache.expiresAt) <= new Date()) {
        return null;
      }

      return cache;
    } catch {
      return null;
    }
  }

  /**
   * 保存缓存到工作空间
   */
  async save(cache: ModelsDevCache): Promise<void> {
    const filePath = this.workspace.getPaths().modelsDevCacheFile;
    const cacheDir = path.dirname(filePath);

    // 确保缓存目录存在
    if (!fs.existsSync(cacheDir)) {
      await fs.promises.mkdir(cacheDir, { recursive: true });
    }

    const content = JSON.stringify(cache, null, 2);
    await fs.promises.writeFile(filePath, content, 'utf-8');
  }

  /**
   * 清除缓存文件
   */
  async clear(): Promise<void> {
    const filePath = this.workspace.getPaths().modelsDevCacheFile;
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  /**
   * 检查缓存文件是否存在
   */
  exists(): boolean {
    const filePath = this.workspace.getPaths().modelsDevCacheFile;
    return fs.existsSync(filePath);
  }

  /**
   * 获取缓存文件路径
   */
  getCachePath(): string {
    return this.workspace.getPaths().modelsDevCacheFile;
  }
}

/**
 * 创建工作空间持久化实例
 */
export function createWorkspacePersistence(workspace: WorkspaceManager): WorkspacePersistence {
  return new WorkspacePersistence(workspace);
}
