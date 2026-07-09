/**
 * Skill Install 工具 — 让 Agent 自己安装技能
 *
 * 安装来源：
 * - GitHub repo: "user/repo" 或完整 URL
 * - npm 包: "package-name"
 * - 本地路径
 *
 * 流程：
 * 1. 解析来源
 * 2. 下载/克隆到临时目录
 * 3. 查找 SKILL.md 文件
 * 4. 复制到 .hive/skills.local/{name}/
 * 5. 调用 SkillRegistry.reload() 热生效
 * 6. 清理临时文件
 */

import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ToolResult } from '../harness/types.js';
import { withHarness } from '../harness/with-harness.js';
import type { RawTool } from '../harness/with-harness.js';
import { DEFAULT_WORKSPACE_DIR } from '../../workspace/index.js';

// ============================================
// 类型
// ============================================

/** 安装审批回调：询问用户是否允许安装 */
export type InstallConfirmCallback = (
  type: 'skill' | 'mcp',
  name: string,
  source: string,
  details: string,
) => Promise<boolean>;

/** 安装后回调：通知宿主新技能已安装 */
export type SkillInstalledCallback = (skillNames: string[]) => void;

/** 重载回调：触发 skill registry 重载 */
export type ReloadSkillsCallback = () => void;

// ============================================
// 全局回调
// ============================================

let installConfirmCallback: InstallConfirmCallback | null = null;
let skillInstalledCallback: SkillInstalledCallback | null = null;
let reloadSkillsCallback: ReloadSkillsCallback | null = null;

export function setInstallConfirmCallback(cb: InstallConfirmCallback): void {
  installConfirmCallback = cb;
}

export function setSkillInstalledCallback(cb: SkillInstalledCallback): void {
  skillInstalledCallback = cb;
}

export function setReloadSkillsCallback(cb: ReloadSkillsCallback): void {
  reloadSkillsCallback = cb;
}

// ============================================
// Schema
// ============================================

const skillInstallInputSchema = z.object({
  source: z.string()
    .min(1)
    .describe('Installation source: GitHub "user/repo", full git URL, npm package name, or local path'),
  skill: z.string()
    .optional()
    .describe('Optional: specific skill name to install from a multi-skill repo'),
  list: z.boolean()
    .optional()
    .describe('If true, list available skills from the source without installing'),
});

export type SkillInstallToolInput = z.infer<typeof skillInstallInputSchema>;

// ============================================
// 实现
// ============================================

/** 解析 GitHub URL */
function resolveSourceUrl(source: string): { type: 'git' | 'npm' | 'local'; url: string; label: string } {
  // user/repo 格式 → GitHub URL
  if (/^[\w.-]+\/[\w.-]+$/.test(source) && !source.includes(':')) {
    return {
      type: 'git',
      url: `https://github.com/${source}.git`,
      label: `GitHub: ${source}`,
    };
  }

  // 本地路径
  if (source.startsWith('/') || source.startsWith('.') || source.startsWith('~') || /^[A-Za-z]:\\/.test(source)) {
    return { type: 'local', url: source, label: `Local: ${source}` };
  }

  // 完整 URL（git）
  if (source.startsWith('http') && (source.endsWith('.git') || source.includes('github.com'))) {
    return { type: 'git', url: source, label: `Git: ${source}` };
  }

  // 默认当作 npm 包
  return { type: 'npm', url: source, label: `npm: ${source}` };
}

/** 创建临时目录 */
function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `hive-skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 查找目录下所有 SKILL.md 文件 */
function findSkillDirs(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(dir, entry.name, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

/** 列出来源中的可用技能 */
function listSkillsFromDir(dir: string): string[] {
  const skillDirs = findSkillDirs(dir);
  return skillDirs.map((d) => path.basename(d));
}

/** 安装技能到 .hive/skills.local/ */
function installSkills(
  sourceDir: string,
  skillNames: string[],
  targetBase: string,
): string[] {
  const installed: string[] = [];

  if (!fs.existsSync(targetBase)) {
    fs.mkdirSync(targetBase, { recursive: true });
  }

  for (const skillName of skillNames) {
    const srcDir = path.join(sourceDir, skillName);
    const targetDir = path.join(targetBase, skillName);

    // 如果已存在，先删除（覆盖更新）
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    // 递归复制
    copyDirSync(srcDir, targetDir);
    installed.push(skillName);
  }

  return installed;
}

/** 递归复制目录 */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** 提取 SKILL.md 中的技能名称 */
function parseSkillNameFromDir(skillDir: string): string | null {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;

  const content = fs.readFileSync(skillMdPath, 'utf-8');
  const match = content.match(/^---\s*\n[\s\S]*?^name:\s*(.+)$[\s\S]*?\n---/m);
  return match ? match[1].trim() : path.basename(skillDir);
}

// ============================================
// RawTool
// ============================================

export function createRawSkillInstallTool(): RawTool<SkillInstallToolInput> {
  return {
    description: 'Install a skill from a GitHub repository, npm package, or local path. '
      + 'Skills are markdown-based instruction files that teach the AI how to perform specific tasks. '
      + 'Use this when the user asks to install a skill, add a capability, or extend the AI\'s abilities.',
    inputSchema: zodSchema(skillInstallInputSchema),
    execute: async ({ source, skill, list }): Promise<ToolResult> => {
      try {
        const resolved = resolveSourceUrl(source);

        // 如果是 list 模式，只列出可用技能
        if (list) {
          if (resolved.type === 'git') {
            const tmpDir = createTempDir();
            try {
              execSync(`git clone --depth 1 ${resolved.url} "${tmpDir}"`, { stdio: 'pipe', timeout: 60_000 });
              const skills = listSkillsFromDir(tmpDir);
              return {
                ok: true,
                code: 'OK',
                data: skills.length > 0
                  ? `Available skills from ${resolved.label}: ${skills.join(', ')}`
                  : `No skills found in ${resolved.label} (no SKILL.md files)`,
              };
            } finally {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            }
          }
          return {
            ok: true,
            code: 'OK',
            data: `Source type "${resolved.type}" does not support listing. Use source=${resolved.label} directly.`,
          };
        }

        // === 安装模式 ===

        // 权限确认
        if (installConfirmCallback) {
          const details = skill
            ? `Install skill "${skill}" from ${resolved.label}`
            : `Install all available skills from ${resolved.label}`;
          const confirmed = await installConfirmCallback('skill', skill ?? resolved.label, resolved.url, details);
          if (!confirmed) {
            return { ok: false, code: 'PERMISSION', error: 'Installation was denied by the user', context: { reason: 'User denied' } };
          }
        }

        const tmpDir = createTempDir();
        try {
          let skillNames: string[] = [];

          if (resolved.type === 'git') {
            execSync(`git clone --depth 1 "${resolved.url}" "${tmpDir}"`, { stdio: 'pipe', timeout: 120_000 });

            if (skill) {
              // 安装特定技能
              const skillDir = path.join(tmpDir, 'skills', skill);
              if (fs.existsSync(skillDir)) {
                skillNames = [skill];
              } else {
                // 直接在根目录找
                const rootSkills = listSkillsFromDir(tmpDir);
                if (rootSkills.includes(skill)) {
                  skillNames = [skill];
                } else {
                  return { ok: false, code: 'EXEC_ERROR', error: `Skill "${skill}" not found in ${resolved.label}` };
                }
              }
            } else {
              // 安装所有技能
              skillNames = listSkillsFromDir(tmpDir);

              // 也检查 skills/ 子目录
              const skillsDir = path.join(tmpDir, 'skills');
              if (fs.existsSync(skillsDir)) {
                skillNames.push(...listSkillsFromDir(skillsDir));
              }

              // 去重
              skillNames = [...new Set(skillNames)];
            }
          } else if (resolved.type === 'npm') {
            execSync(`npm pack "${resolved.url}" --pack-destination "${tmpDir}"`, { stdio: 'pipe', timeout: 120_000 });
            // npm 包解压后查找技能
            const packages = fs.readdirSync(tmpDir).filter(f => f.endsWith('.tgz'));
            if (packages.length > 0) {
              execSync(`tar -xzf "${path.join(tmpDir, packages[0])}" -C "${tmpDir}"`, { stdio: 'pipe' });
              const extractedDir = path.join(tmpDir, 'package');
              skillNames = listSkillsFromDir(extractedDir);
            }
          } else if (resolved.type === 'local') {
            skillNames = listSkillsFromDir(resolved.url);
            if (skill) {
              skillNames = skillNames.filter(n => n === skill);
            }
          }

          if (skillNames.length === 0) {
            return { ok: false, code: 'EXEC_ERROR', error: `No skills found in ${resolved.label}. Make sure the source contains SKILL.md files.` };
          }

          // 安装到 .hive/skills.local/
          const cwd = process.cwd();
          const targetBase = path.resolve(cwd, DEFAULT_WORKSPACE_DIR, 'skills.local');

          let sourceDir: string;
          if (resolved.type === 'git') {
            // 优先使用 skills/ 子目录
            const skillsSubDir = path.join(tmpDir, 'skills');
            sourceDir = fs.existsSync(skillsSubDir) && fs.readdirSync(skillsSubDir).length > 0
              ? skillsSubDir
              : tmpDir;
          } else if (resolved.type === 'npm') {
            sourceDir = path.join(tmpDir, 'package');
          } else {
            sourceDir = resolved.url;
          }

          const installed = installSkills(sourceDir, skillNames, targetBase);

          // 触发重载
          reloadSkillsCallback?.();

          const names = installed.map((n) => {
            const realName = parseSkillNameFromDir(path.join(targetBase, n));
            return realName ?? n;
          });

          skillInstalledCallback?.(names);

          return {
            ok: true,
            code: 'OK',
            data: [
              `Successfully installed ${names.length} skill(s):`,
              ...names.map((n) => `  - ${n}`),
              '',
              'Skills are now active and ready to use.',
            ].join('\n'),
          };
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, code: 'EXEC_ERROR', error: `Failed to install skill: ${msg}` };
      }
    },
  };
}

// ============================================
// AI SDK Tool
// ============================================

export function createSkillInstallTool(): Tool<SkillInstallToolInput, string> {
  return withHarness(createRawSkillInstallTool(), { toolName: 'skill-install-tool' });
}
