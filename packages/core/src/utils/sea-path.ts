/**
 * SEA 感知的资源路径解析
 *
 * 统一处理 ESM 开发环境和 Node.js SEA 打包环境的路径差异。
 * - ESM 开发：基于调用方的 import.meta.url（通过 baseURL 参数传入）
 * - SEA 生产：基于 __dirname（指向 binary 所在目录）
 *
 * 配合 sea-config.json 的 assets 字段，支持从 SEA blob 读取嵌入的文本文件。
 */

import { isSea, getAsset } from 'node:sea';
import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * 解析资源文件路径
 *
 * @param esmRelative - 相对于 baseURL 的路径（ESM 环境使用）
 * @param seaRelative - 相对于 SEA binary 目录的路径（SEA 环境使用）
 * @param baseURL     - ESM 环境下的基准 URL（通常是 import.meta.url）
 * @returns 解析后的绝对路径
 */
export function resolveAsset(
  esmRelative: string,
  seaRelative: string,
  baseURL?: string,
): string {
  if (isSea()) {
    return resolve(__dirname, seaRelative);
  }
  // ESM: 基于调用方的 import.meta.url（通过 baseURL 传入）
  const base = baseURL ?? import.meta.url;
  return fileURLToPath(new URL(esmRelative, base));
}

/**
 * 从 SEA asset 或文件系统加载文本内容
 *
 * - SEA 环境：从嵌入的 blob 读取（零磁盘 I/O）
 * - 开发环境：从文件系统读取
 *
 * @param assetKey - SEA asset key（如 'coordinator.md'）
 * @param fsPath   - 文件系统回退路径（开发环境使用）
 * @returns 文件文本内容
 */
export function readAssetText(assetKey: string, fsPath: string): string {
  if (isSea()) {
    return getAsset(assetKey, 'utf8');
  }
  return readFileSync(fsPath, 'utf-8');
}

/**
 * 检查文件是否存在（兼容 SEA 环境）
 */
export function assetExists(
  esmRelative: string,
  seaRelative: string,
  baseURL?: string,
): boolean {
  return existsSync(resolveAsset(esmRelative, seaRelative, baseURL));
}

export { isSea };
