/**
 * Prompt 模板系统
 *
 * 从 templates/ 目录加载 .md 文件作为提示词模板。
 * 模板文件通过 `pnpm run copy-templates` 复制到 dist 目录。
 *
 * 模板目录结构:
 * - templates/explore.md            - Explore Agent 主模板
 * - templates/plan.md               - Plan Agent 主模板
 * - templates/intelligent.md        - Intelligent Agent 主模板
 * - templates/compact.md            - 上下文压缩模板
 * - templates/schedule-awareness.md - 定时任务感知模板
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES 模块中获取 __dirname
// 兼容 SEA 环境：import.meta.url 在 CJS bundle 中可能为空，回退到 process.argv[1]
function getTemplatesDir(): string {
  try {
    const metaUrl = import.meta.url;
    if (metaUrl && metaUrl !== 'undefined') {
      const __filename = fileURLToPath(metaUrl);
      return path.join(path.dirname(__filename), 'templates');
    }
  } catch { /* fallback below */ }

  // SEA / CJS fallback: 从 main script 所在目录向上查找
  const mainDir = path.dirname(process.argv[1]);
  return path.join(mainDir, 'agents', 'prompts', 'templates');
}

// 模板目录
export const TEMPLATES_DIR = getTemplatesDir();

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
    // 检查缓存
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    // 从文件加载
    const filePath = path.join(TEMPLATES_DIR, `${name}.md`);

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.cache.set(name, content);
      return content;
    }

    throw new Error(`Prompt template not found: ${name}`);
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
   * 检查模板文件是否存在
   */
  hasTemplateFile(name: string): boolean {
    const filePath = path.join(TEMPLATES_DIR, `${name}.md`);
    return fs.existsSync(filePath);
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
