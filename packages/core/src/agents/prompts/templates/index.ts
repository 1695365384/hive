/**
 * 模板索引和热重载支持
 *
 * 提供模板列表、验证和热重载功能
 */

import * as fs from 'fs';
import * as path from 'path';
import { getPromptTemplate, TEMPLATES_DIR } from '../PromptTemplate.js';

/**
 * 列出所有可用模板
 *
 * @returns 模板名称列表（不含扩展名）
 */
export function listTemplates(): string[] {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    return [];
  }

  const templates: string[] = [];

  // 递归扫描目录
  function scanDir(dir: string, prefix: string = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        scanDir(path.join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const name = entry.name.replace('.md', '');
        templates.push(prefix ? `${prefix}/${name}` : name);
      }
    }
  }

  scanDir(TEMPLATES_DIR);
  return templates.sort();
}

/**
 * 按类别列出模板
 */
export function listTemplatesByCategory(): {
  main: string[];
  agents: string[];
  styles: string[];
  guides: string[];
} {
  const all = listTemplates();

  return {
    main: all.filter(t => !t.includes('/') && !t.includes('style') && !t.includes('guide')),
    agents: all.filter(t => t.startsWith('agents/')),
    styles: all.filter(t => t.includes('style')),
    guides: all.filter(t => t.includes('guide')),
  };
}

/**
 * 清除模板缓存（用于热重载）
 *
 * 清除后，下次加载模板时会重新从文件读取
 */
export function reloadTemplates(): void {
  getPromptTemplate().clearCache();
}

/**
 * 清除特定模板的缓存
 */
export function reloadTemplate(name: string): boolean {
  return getPromptTemplate().clearTemplateCache(name);
}

/**
 * 验证所有模板
 *
 * @returns 验证结果，包含有效和无效的模板列表
 */
export function validateTemplates(): { valid: string[]; invalid: string[]; errors: Record<string, string> } {
  const templates = listTemplates();
  const valid: string[] = [];
  const invalid: string[] = [];
  const errors: Record<string, string> = {};

  for (const name of templates) {
    try {
      getPromptTemplate().load(name);
      valid.push(name);
    } catch (e) {
      invalid.push(name);
      errors[name] = e instanceof Error ? e.message : String(e);
    }
  }

  return { valid, invalid, errors };
}

/**
 * 获取模板信息
 */
export function getTemplateInfo(name: string): {
  name: string;
  exists: boolean;
  cached: boolean;
  path: string;
} {
  const template = getPromptTemplate();
  const filePath = path.join(TEMPLATES_DIR, `${name}.md`);

  return {
    name,
    exists: template.hasTemplateFile(name),
    cached: (template as any).cache.has(name),
    path: filePath,
  };
}

/**
 * 检查模板文件是否存在
 */
export function hasTemplate(name: string): boolean {
  return getPromptTemplate().hasTemplateFile(name);
}
