/**
 * Skill Installer
 *
 * 从 GitHub 仓库安装技能到 skills.local/ 目录
 * 遵循 agentskills.io 标准路径发现 SKILL.md
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { parseFrontmatter, DEFAULT_WORKSPACE_DIR } from '@bundy-lmw/hive-core';

// ============================================
// Types
// ============================================

export interface DiscoveredSkill {
  name: string;
  sourceDir: string;
  skillMdPath: string;
}

export interface InstallResult {
  installed: string[];
  updated: string[];
  skipped: string[];
}

export interface InstallOptions {
  targetDir?: string;
  skills?: string[];
  listOnly?: boolean;
}

// ============================================
// parseSource
// ============================================

/**
 * 解析安装源
 *
 * 支持格式：
 * - owner/repo → https://github.com/owner/repo
 * - https://github.com/owner/repo → 直通
 * - git@github.com:owner/repo.git → 直通
 */
export function parseSource(source: string): { url: string; repoName: string } {
  // owner/repo shorthand
  const shorthandMatch = source.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shorthandMatch) {
    return {
      url: `https://github.com/${shorthandMatch[1]}/${shorthandMatch[2]}`,
      repoName: shorthandMatch[2],
    };
  }

  // Full GitHub URL
  const githubMatch = source.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (githubMatch) {
    return {
      url: source,
      repoName: githubMatch[2].replace(/\.git$/, ''),
    };
  }

  // Git URL or any other URL — pass through
  const repoName = source.split('/').pop()?.replace(/\.git$/, '') ?? 'unknown';
  return { url: source, repoName };
}

// ============================================
// cloneRepo
// ============================================

let activeTempDir: string | null = null;
let activeHandler: (() => void) | null = null;

/**
 * 注册信号处理，确保进程中断时清理临时目录
 */
function registerCleanupHandler(tempDir: string): void {
  activeTempDir = tempDir;
  activeHandler = () => {
    cleanup(tempDir);
    process.exit(1);
  };
  process.on('SIGINT', activeHandler);
  process.on('SIGTERM', activeHandler);
}

/**
 * 注销信号处理
 */
function unregisterCleanupHandler(): void {
  activeTempDir = null;
  if (activeHandler) {
    process.removeListener('SIGINT', activeHandler);
    process.removeListener('SIGTERM', activeHandler);
    activeHandler = null;
  }
}

/**
 * 校验 URL 安全性，防止命令注入
 *
 * 拒绝含空格、引号、反引号、$()、分号、-- 的输入
 */
export function validateCloneUrl(url: string): void {
  if (/\s/.test(url)) {
    throw new Error(`Invalid repository URL: whitespace is not allowed`);
  }
  if (/--\w/.test(url)) {
    throw new Error(`Invalid repository URL: option flags are not allowed`);
  }
  if (/['"`;$&|(){}]/.test(url)) {
    throw new Error(`Invalid repository URL: special characters are not allowed`);
  }
}

/**
 * 克隆仓库到临时目录
 */
export async function cloneRepo(url: string): Promise<string> {
  validateCloneUrl(url);

  const tempDir = path.join(tmpdir(), `hive-skill-install-${randomBytes(8).toString('hex')}`);

  try {
    registerCleanupHandler(tempDir);

    execSync(`git clone --depth 1 "${url}" "${tempDir}"`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    });

    return tempDir;
  } catch (error) {
    cleanup(tempDir);
    throw new Error(
      `Failed to clone repository: ${url}\n${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    unregisterCleanupHandler();
  }
}

// ============================================
// discoverSkills
// ============================================

/**
 * agentskills.io 标准发现路径（按优先级排序）
 */
const SKILL_DISCOVERY_PATHS = [
  'skills',
  'skills/.curated',
  'skills/.experimental',
  '.claude/skills',
  '.agents/skills',
  '.augment/skills',
  '.cursor/skills',
];

/**
 * 在克隆的仓库目录中发现技能
 *
 * 按标准路径顺序查找 SKILL.md，最后递归兜底
 */
export function discoverSkills(repoDir: string): DiscoveredSkill[] {
  const found = new Map<string, DiscoveredSkill>();

  // 按标准路径顺序查找
  for (const searchPath of SKILL_DISCOVERY_PATHS) {
    const fullDir = path.join(repoDir, searchPath);
    if (!fs.existsSync(fullDir)) continue;

    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(fullDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;

      const name = entry.name;
      if (!found.has(name)) {
        found.set(name, {
          name,
          sourceDir: path.join(fullDir, entry.name),
          skillMdPath: skillMd,
        });
      }
    }
  }

  // 检查根目录 SKILL.md（单技能仓库）
  const rootSkillMd = path.join(repoDir, 'SKILL.md');
  if (fs.existsSync(rootSkillMd) && !found.has('root')) {
    try {
      const content = fs.readFileSync(rootSkillMd, 'utf-8');
      const { metadata } = parseFrontmatter(content);
      found.set(metadata.name, {
        name: metadata.name,
        sourceDir: repoDir,
        skillMdPath: rootSkillMd,
      });
    } catch {
      // frontmatter 解析失败时用目录名兜底
      found.set('root', {
        name: 'root',
        sourceDir: repoDir,
        skillMdPath: rootSkillMd,
      });
    }
  }

  // 递归兜底搜索
  if (found.size === 0) {
    const walkResults = recursiveFindSkillMd(repoDir, repoDir);
    for (const result of walkResults) {
      if (!found.has(result.name)) {
        found.set(result.name, result);
      }
    }
  }

  return Array.from(found.values());
}

function recursiveFindSkillMd(baseDir: string, currentDir: string): DiscoveredSkill[] {
  const results: DiscoveredSkill[] = [];
  if (!fs.existsSync(currentDir)) return results;

  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      results.push(...recursiveFindSkillMd(baseDir, fullPath));
      continue;
    }

    if (entry.isFile() && entry.name === 'SKILL.md') {
      const parentName = path.basename(currentDir);
      results.push({
        name: parentName,
        sourceDir: currentDir,
        skillMdPath: fullPath,
      });
    }
  }

  return results;
}

// ============================================
// installSkills
// ============================================

/**
 * 安装技能到目标目录
 *
 * 含路径穿越检查和同名覆盖处理
 */
export function installSkills(
  skills: DiscoveredSkill[],
  targetDir: string,
  options: { filter?: string[] } = {}
): InstallResult {
  const result: InstallResult = { installed: [], updated: [], skipped: [] };

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filter = options.filter;
  const toInstall = filter && filter.length > 0
    ? skills.filter(s => filter.includes(s.name))
    : skills;

  if (toInstall.length === 0) {
    return result;
  }

  for (const skill of toInstall) {
    const destDir = path.join(targetDir, skill.name);
    const isUpdate = fs.existsSync(destDir);

    // 路径穿越检查
    const resolvedDest = path.resolve(destDir);
    const resolvedTarget = path.resolve(targetDir);
    if (!resolvedDest.startsWith(resolvedTarget + path.sep) && resolvedDest !== resolvedTarget) {
      console.warn(`  ⚠ Skipping "${skill.name}": path traversal detected`);
      result.skipped.push(skill.name);
      continue;
    }

    // 复制目录
    if (isUpdate) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }

    copyDirSafe(skill.sourceDir, destDir);

    if (isUpdate) {
      result.updated.push(skill.name);
    } else {
      result.installed.push(skill.name);
    }
  }

  return result;
}

/**
 * 安全复制目录，跳过包含路径穿越的文件
 */
function copyDirSafe(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // 路径穿越检查
    const resolvedDest = path.resolve(destPath);
    const resolvedBase = path.resolve(dest);
    if (!resolvedDest.startsWith(resolvedBase + path.sep) && resolvedDest !== resolvedBase) {
      console.warn(`  ⚠ Skipping file with path traversal: ${entry.name}`);
      continue;
    }

    if (entry.isDirectory()) {
      copyDirSafe(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ============================================
// cleanup
// ============================================

/**
 * 递归删除临时目录
 */
export function cleanup(dir: string): void {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // 静默失败 — 系统临时目录会自动清理
  }
}

/**
 * 清理当前活跃的临时目录
 */
export function cleanupActive(): void {
  if (activeTempDir) {
    cleanup(activeTempDir);
    activeTempDir = null;
  }
}

// ============================================
// Public API
// ============================================

/**
 * 从 GitHub 仓库安装技能
 *
 * 完整流程: parseSource → cloneRepo → discoverSkills → installSkills → cleanup
 */
export async function installFromSource(
  source: string,
  options: InstallOptions = {}
): Promise<{ result: InstallResult; discovered: DiscoveredSkill[] }> {
  const { url, repoName } = parseSource(source);
  const targetDir = options.targetDir ?? path.resolve(process.cwd(), DEFAULT_WORKSPACE_DIR, 'skills.local');

  let tempDir: string;
  try {
    tempDir = await cloneRepo(url);
  } catch (error) {
    throw new Error(`Failed to clone "${repoName}". Check the repository URL.\n${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const discovered = discoverSkills(tempDir);

    if (discovered.length === 0) {
      throw new Error(`No skills found in "${repoName}". The repository must contain SKILL.md files.`);
    }

    if (options.listOnly) {
      return { result: { installed: [], updated: [], skipped: [] }, discovered };
    }

    const result = installSkills(discovered, targetDir, { filter: options.skills });

    // 检查是否有请求的技能未找到
    const requestedSkills = options.skills;
    if (requestedSkills && requestedSkills.length > 0) {
      const foundNames = new Set(discovered.map(s => s.name));
      for (const requested of requestedSkills) {
        if (!foundNames.has(requested)) {
          result.skipped.push(requested);
        }
      }
    }

    return { result, discovered };
  } finally {
    cleanup(tempDir);
  }
}
