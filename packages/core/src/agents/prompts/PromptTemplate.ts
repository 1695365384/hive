/**
 * Prompt 模板系统
 *
 * 从 templates/ 目录加载 .md 文件作为提示词模板。
 * 模板文件通过 `pnpm run copy-templates` 复制到 dist 目录。
 * SEA 环境下通过 node:sea 的 getAsset() 从 blob 读取嵌入的模板。
 *
 * 模板目录结构:
 * - templates/explore.md            - Explore Agent 主模板（plan 已合并）
 * - templates/intelligent.md        - General Agent 主模板
 * - templates/compact.md            - 上下文压缩模板
 * - templates/schedule-awareness.md - 定时任务感知模板
 */

import * as path from 'path';
import { resolveAsset, readAssetText, assetExists } from '../../utils/sea-path.js';

// 模板目录（ESM 环境下的文件系统路径，用于 hasTemplateFile 检查）
export const TEMPLATES_DIR = resolveAsset(
  '../prompts/templates',
  'agents/prompts/templates',
  import.meta.url,
);

/**
 * 模板变量类型
 */
export type TemplateVariables = Record<string, string | number | boolean>;

/**
 * Prompt 模板类
 */
export class PromptTemplate {
  private cache: Map<string, string> = new Map();

  /**
   * 加载模板文件
   *
   * @param name - 模板名称（不含扩展名，支持子目录如 'agents/explore'）
   * @returns 模板内容
   */
  load(name: string): string {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    const assetKey = `${name}.md`;
    const fsPath = path.join(TEMPLATES_DIR, assetKey);

    let content: string;
    try {
      content = readAssetText(assetKey, fsPath);
    } catch {
      throw new Error(`Prompt template not found: ${name}`);
    }

    this.cache.set(name, content);
    return content;
  }

  /**
   * 渲染模板（替换 {{variable}} 变量）
   */
  render(name: string, variables: TemplateVariables = {}): string {
    let template = this.load(name);

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      template = template.replace(regex, String(value));
    }

    return template;
  }

  /**
   * 清除缓存（用于热重载）
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 清除特定模板的缓存
   */
  clearTemplateCache(name: string): boolean {
    return this.cache.delete(name);
  }

  /**
   * 检查模板是否已缓存
   */
  isCached(name: string): boolean {
    return this.cache.has(name);
  }

  /**
   * 检查模板文件是否存在（仅检查文件系统，SEA 环境始终返回 false）
   */
  hasTemplateFile(name: string): boolean {
    return assetExists(
      `../prompts/templates/${name}.md`,
      `agents/prompts/templates/${name}.md`,
      import.meta.url,
    );
  }
}

// 单例
let globalTemplate: PromptTemplate | null = null;

/**
 * 获取全局 Prompt 模板
 */
export function getPromptTemplate(): PromptTemplate {
  if (!globalTemplate) {
    globalTemplate = new PromptTemplate();
  }
  return globalTemplate;
}

/**
 * 创建新的 Prompt 模板
 */
export function createPromptTemplate(): PromptTemplate {
  return new PromptTemplate();
}
