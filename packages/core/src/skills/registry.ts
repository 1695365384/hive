/**
 * 技能注册表
 *
 * 管理所有已加载的技能：
 * 1. 注册技能
 * 2. 按名称获取技能
 * 3. 列出所有技能
 * 4. 匹配技能
 */

import type { Skill, SkillMetadata, SkillMatchResult, SkillSystemConfig } from './types.js';
import { SkillLoader, createSkillLoader } from './loader.js';
import { SkillMatcher, createSkillMatcher } from './matcher.js';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_WORKSPACE_DIR } from '../workspace/index.js';

function resolveBuiltinSkillsDir(): string {
  const envSkillsDir = process.env.HIVE_SKILLS_DIR?.trim();
  if (envSkillsDir) {
    return path.resolve(envSkillsDir);
  }

  return path.resolve(process.cwd(), DEFAULT_WORKSPACE_DIR, 'skills');
}

/**
 * 技能注册表类
 */
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private matcher: SkillMatcher;
  private loader: SkillLoader | null = null;
  private config: SkillSystemConfig;
  private dirSignatures: Map<string, string> = new Map();
  private autoRefreshEnabled = false;

  constructor(config: SkillSystemConfig = {}) {
    this.matcher = createSkillMatcher();
    this.config = {
      builtinSkillsDir: resolveBuiltinSkillsDir(),
      userSkillsDir: path.resolve(process.cwd(), DEFAULT_WORKSPACE_DIR, 'skills.local'),
      enableAutoMatch: true,
      showSkillsInPrompt: true,
      ...config,
    };
  }

  /**
   * 初始化注册表
   *
   * 加载内置技能和用户技能
   */
  async initialize(): Promise<void> {
    this.autoRefreshEnabled = true;
    this.reloadAllSkills();
  }

  private getConfiguredSkillDirs(): string[] {
    return [this.config.builtinSkillsDir, this.config.userSkillsDir].filter((dir): dir is string => Boolean(dir));
  }

  private collectSkillFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) {
      return [];
    }

    const files: string[] = [];
    const walk = (currentDir: string): void => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (entry.isFile() && entry.name === 'SKILL.md') {
          files.push(fullPath);
        }
      }
    };

    walk(dir);
    return files.sort();
  }

  private computeDirSignature(dir: string): string {
    const skillFiles = this.collectSkillFiles(dir);
    if (skillFiles.length === 0) {
      return 'empty';
    }

    const parts = skillFiles.map((filePath) => {
      const stat = fs.statSync(filePath);
      const relativePath = path.relative(dir, filePath);
      return `${relativePath}:${stat.mtimeMs}:${stat.size}`;
    });

    return parts.join('|');
  }

  private refreshIfChanged(): void {
    if (!this.autoRefreshEnabled) {
      return;
    }

    const dirs = this.getConfiguredSkillDirs();
    let changed = false;

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        continue;
      }

      const nextSignature = this.computeDirSignature(dir);
      const prevSignature = this.dirSignatures.get(dir);
      if (prevSignature !== nextSignature) {
        changed = true;
      }
    }

    if (changed) {
      this.reloadAllSkills();
    }
  }

  private loadFromDirectorySync(dir: string): void {
    if (!fs.existsSync(dir)) {
      return;
    }

    this.loader = createSkillLoader({
      skillsDir: dir,
      recursive: true,
    });

    const skills = this.loader.loadSkills();
    for (const skill of skills) {
      this.register(skill);
    }

    this.dirSignatures.set(dir, this.computeDirSignature(dir));
  }

  private reloadAllSkills(): void {
    this.skills.clear();
    this.dirSignatures.clear();
    this.matcher.clearCache();

    for (const dir of this.getConfiguredSkillDirs()) {
      this.loadFromDirectorySync(dir);
    }
  }

  /**
   * 从目录加载技能
   *
   * @param dir - 技能目录路径
   */
  async loadFromDirectory(dir: string): Promise<void> {
    this.loadFromDirectorySync(dir);
  }

  /**
   * 注册技能
   *
   * @param skill - 技能对象
   */
  register(skill: Skill): void {
    const key = this.getSkillKey(skill);
    this.skills.set(key, skill);
    // 清除匹配器缓存
    this.matcher.clearCache();
  }

  /**
   * 注销技能
   *
   * @param name - 技能名称
   */
  unregister(name: string): boolean {
    const key = name.toLowerCase();
    const result = this.skills.delete(key);
    if (result) {
      this.matcher.clearCache();
    }
    return result;
  }

  /**
   * 获取技能键
   */
  private getSkillKey(skill: Skill): string {
    return skill.metadata.name.toLowerCase();
  }

  /**
   * 按名称获取技能
   *
   * @param name - 技能名称
   * @returns 技能对象，如果不存在则返回 undefined
   */
  get(name: string): Skill | undefined {
    this.refreshIfChanged();
    return this.skills.get(name.toLowerCase());
  }

  /**
   * 检查技能是否存在
   *
   * @param name - 技能名称
   */
  has(name: string): boolean {
    this.refreshIfChanged();
    return this.skills.has(name.toLowerCase());
  }

  /**
   * 获取所有技能
   *
   * @returns 技能数组
   */
  getAll(): Skill[] {
    this.refreshIfChanged();
    return Array.from(this.skills.values());
  }

  /**
   * 获取所有技能元数据
   *
   * 用于在系统提示中显示可用技能
   *
   * @returns 元数据数组
   */
  getAllMetadata(): SkillMetadata[] {
    return this.getAll().map((skill) => skill.metadata);
  }

  /**
   * 获取技能数量
   */
  get size(): number {
    this.refreshIfChanged();
    return this.skills.size;
  }

  /**
   * 匹配技能
   *
   * 根据用户输入自动匹配最佳技能
   *
   * @param input - 用户输入
   * @returns 匹配结果，如果没有匹配则返回 null
   */
  match(input: string): SkillMatchResult | null {
    if (!this.config.enableAutoMatch) {
      return null;
    }

    return this.matcher.matchBest(input, this.getAll());
  }

  /**
   * 匹配所有符合条件的技能
   *
   * @param input - 用户输入
   * @returns 所有匹配结果
   */
  matchAll(input: string): SkillMatchResult[] {
    if (!this.config.enableAutoMatch) {
      return [];
    }

    return this.matcher.matchAll(input, this.getAll());
  }

  /**
   * 生成技能列表描述
   *
   * 用于系统提示
   *
   * @returns 格式化的技能列表字符串
   */
  generateSkillListDescription(): string {
    const skills = this.getAll();

    if (skills.length === 0) {
      return '';
    }

    const lines = skills.map((skill) => {
      const { name, description } = skill.metadata;
      return `- **${name}**: ${description}`;
    });

    return `## Available Skills\n\n${lines.join('\n')}`;
  }

  /**
   * 生成技能详细指令
   *
   * 当技能被触发时，生成完整的技能指令
   *
   * @param skill - 技能对象
   * @returns 完整的技能指令
   */
  generateSkillInstruction(skill: Skill): string {
    let instruction = `## Active Skill: ${skill.metadata.name}\n\n`;
    instruction += `**Description**: ${skill.metadata.description}\n\n`;
    instruction += `**Version**: ${skill.metadata.version}\n\n`;
    instruction += `### Instructions\n\n${skill.body}`;

    return instruction;
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.skills.clear();
    this.matcher.clearCache();
  }
}

// ============================================
// 全局实例和便捷函数
// ============================================

let globalRegistry: SkillRegistry | null = null;

/**
 * 获取全局技能注册表
 */
export function getSkillRegistry(config?: SkillSystemConfig): SkillRegistry {
  if (!globalRegistry) {
    globalRegistry = new SkillRegistry(config);
  }
  return globalRegistry;
}

/**
 * 创建新的技能注册表
 */
export function createSkillRegistry(config?: SkillSystemConfig): SkillRegistry {
  return new SkillRegistry(config);
}

/**
 * 初始化全局技能注册表
 */
export async function initializeSkills(config?: SkillSystemConfig): Promise<SkillRegistry> {
  const registry = getSkillRegistry(config);
  await registry.initialize();
  return registry;
}
