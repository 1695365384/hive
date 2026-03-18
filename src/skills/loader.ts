/**
 * 技能加载器
 *
 * 负责从文件系统加载技能：
 * 1. 扫描技能目录
 * 2. 解析 SKILL.md 文件
 * 3. 提取 YAML frontmatter
 * 4. 发现捆绑资源
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Skill, SkillMetadata, SkillLoaderOptions } from './types.js';

// 重新导出类型以保持兼容
export type { SkillLoaderOptions } from './types.js';

/**
 * 解析 YAML frontmatter
 *
 * 从 Markdown 内容中提取 YAML frontmatter 和正文
 *
 * @param content - SKILL.md 文件内容
 * @returns 元数据和正文
 */
export function parseFrontmatter(content: string): { metadata: SkillMetadata; body: string } {
  // 匹配 YAML frontmatter: ---\n...\n---
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error('Invalid SKILL.md: missing YAML frontmatter');
  }

  const [, frontmatter, body] = match;

  // 简单的 YAML 解析（支持基本键值对）
  const rawMetadata = parseSimpleYaml(frontmatter);

  // 验证必需字段
  if (!rawMetadata.name || typeof rawMetadata.name !== 'string') {
    throw new Error('Invalid SKILL.md: missing "name" field');
  }
  if (!rawMetadata.description || typeof rawMetadata.description !== 'string') {
    throw new Error('Invalid SKILL.md: missing "description" field');
  }

  // 构建正确的 SkillMetadata 对象
  const metadata: SkillMetadata = {
    name: rawMetadata.name,
    description: rawMetadata.description,
    version: typeof rawMetadata.version === 'string' ? rawMetadata.version : '0.0.1',
    author: typeof rawMetadata.author === 'string' ? rawMetadata.author : undefined,
    tags: Array.isArray(rawMetadata.tags) ? rawMetadata.tags as string[] : undefined,
  };

  return {
    metadata,
    body: body.trim(),
  };
}

/**
 * 简单 YAML 解析器
 *
 * 支持基本键值对、数组和多行字符串
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;
  let inMultilineString = false;
  let multilineValue: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 跳过空行和注释
    if (!trimmed || trimmed.startsWith('#')) {
      if (inMultilineString) {
        multilineValue.push('');
      }
      continue;
    }

    // 处理多行字符串（以 | 或 > 开头）
    if (inMultilineString) {
      if (line.startsWith('  ') || line.startsWith('\t')) {
        multilineValue.push(trimmed);
        continue;
      } else {
        // 多行字符串结束
        if (currentKey) {
          result[currentKey] = multilineValue.join('\n');
        }
        inMultilineString = false;
        currentKey = null;
        multilineValue = [];
      }
    }

    // 检查键值对
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      // 可能是数组项
      if (trimmed.startsWith('- ') && currentArray) {
        currentArray.push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ''));
      }
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();

    // 检查是否是数组开始
    if (value === '' || value === '[]') {
      currentKey = key;
      currentArray = [];
      result[key] = currentArray;
      continue;
    }

    // 检查是否是多行字符串
    if (value === '|' || value === '>') {
      currentKey = key;
      inMultilineString = true;
      multilineValue = [];
      continue;
    }

    // 处理数组内联格式 [item1, item2]
    if (value.startsWith('[') && value.endsWith(']')) {
      const items = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^["']|["']$/g, ''));
      result[key] = items;
      currentKey = null;
      currentArray = null;
      continue;
    }

    // 处理普通值
    currentKey = key;
    currentArray = null;

    // 去除引号
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  // 处理未闭合的多行字符串
  if (inMultilineString && currentKey) {
    result[currentKey] = multilineValue.join('\n');
  }

  return result;
}

/**
 * 发现技能目录中的捆绑资源
 */
function discoverResources(skillDir: string): {
  references: string[];
  scripts: string[];
  examples: string[];
  assets: string[];
} {
  const resources = {
    references: [] as string[],
    scripts: [] as string[],
    examples: [] as string[],
    assets: [] as string[],
  };

  // 资源目录映射
  const resourceDirs: Record<string, keyof typeof resources> = {
    references: 'references',
    scripts: 'scripts',
    examples: 'examples',
    assets: 'assets',
  };

  // 文件扩展名映射
  const extensionMap: Record<string, keyof typeof resources> = {
    '.md': 'references',
    '.txt': 'references',
    '.py': 'scripts',
    '.sh': 'scripts',
    '.js': 'scripts',
    '.ts': 'scripts',
  };

  for (const [dirName, resourceType] of Object.entries(resourceDirs)) {
    const dirPath = path.join(skillDir, dirName);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        if (fs.statSync(filePath).isFile()) {
          resources[resourceType].push(filePath);
        }
      }
    }
  }

  // 扫描根目录的单个资源文件
  const rootFiles = fs.readdirSync(skillDir);
  for (const file of rootFiles) {
    if (file === 'SKILL.md') continue;

    const filePath = path.join(skillDir, file);
    if (fs.statSync(filePath).isFile()) {
      const ext = path.extname(file);
      const resourceType = extensionMap[ext];
      if (resourceType) {
        resources[resourceType].push(filePath);
      }
    }
  }

  return resources;
}

/**
 * 技能加载器类
 */
export class SkillLoader {
  private options: SkillLoaderOptions;

  constructor(options: SkillLoaderOptions) {
    this.options = {
      recursive: true,
      encoding: 'utf-8',
      ...options,
    };
  }

  /**
   * 加载单个技能
   *
   * @param skillDir - 技能目录路径
   * @returns 技能对象
   */
  loadSkill(skillDir: string): Skill {
    const skillPath = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillPath)) {
      throw new Error(`Skill not found: ${skillPath}`);
    }

    const content = fs.readFileSync(skillPath, this.options.encoding ?? 'utf-8');
    const { metadata, body } = parseFrontmatter(content);
    const resources = discoverResources(skillDir);

    return {
      metadata,
      body,
      path: skillDir,
      ...resources,
    };
  }

  /**
   * 加载所有技能
   *
   * @returns 技能数组
   */
  loadSkills(): Skill[] {
    const skills: Skill[] = [];
    const skillsDir = this.options.skillsDir;

    if (!fs.existsSync(skillsDir)) {
      return skills;
    }

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(skillsDir, entry.name);
      const skillPath = path.join(skillDir, 'SKILL.md');

      if (fs.existsSync(skillPath)) {
        try {
          const skill = this.loadSkill(skillDir);
          skills.push(skill);
        } catch (error) {
          console.warn(`Failed to load skill from ${skillDir}:`, error);
        }
      }

      // 递归扫描子目录
      if (this.options.recursive) {
        const subLoader = new SkillLoader({
          ...this.options,
          skillsDir: skillDir,
        });
        const subSkills = subLoader.loadSkills();
        skills.push(...subSkills);
      }
    }

    return skills;
  }

  /**
   * 加载参考文件
   *
   * @param skill - 技能对象
   * @param filename - 文件名
   * @returns 文件内容
   */
  loadReference(skill: Skill, filename: string): string {
    // 安全检查：防止路径遍历攻击
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error(`Invalid filename: path traversal not allowed`);
    }

    // 只匹配 basename，忽略完整路径
    const refPath = skill.references.find(
      (ref) => path.basename(ref) === filename
    );

    if (!refPath) {
      throw new Error(`Reference not found: ${filename}`);
    }

    // 验证解析后的路径仍在技能目录内
    const resolvedPath = path.resolve(refPath);
    const skillDirResolved = path.resolve(skill.path);
    if (!resolvedPath.startsWith(skillDirResolved)) {
      throw new Error(`Security: attempted to read outside skill directory`);
    }

    return fs.readFileSync(refPath, this.options.encoding ?? 'utf-8');
  }

  /**
   * 加载所有参考文件
   *
   * @param skill - 技能对象
   * @returns 文件名到内容的映射
   */
  loadAllReferences(skill: Skill): Map<string, string> {
    const references = new Map<string, string>();

    for (const refPath of skill.references) {
      const filename = path.basename(refPath);
      references.set(filename, fs.readFileSync(refPath, this.options.encoding ?? 'utf-8'));
    }

    return references;
  }
}

/**
 * 创建技能加载器
 */
export function createSkillLoader(options: SkillLoaderOptions): SkillLoader {
  return new SkillLoader(options);
}
