/**
 * Skill CLI 命令组
 *
 * hive skill add <source>   — 从 GitHub 仓库安装技能
 * hive skill list           — 列出已安装技能
 * hive skill remove <name>  — 移除用户技能
 */

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_WORKSPACE_DIR, parseFrontmatter } from '@bundy-lmw/hive-core';
import {
  installFromSource,
  cleanupActive,
} from './installer.js';

const DEFAULT_BUILTIN_DIR = `${DEFAULT_WORKSPACE_DIR}/skills`;
const DEFAULT_USER_DIR = `${DEFAULT_WORKSPACE_DIR}/skills.local`;

function getBuiltinDir(): string {
  const envDir = process.env.HIVE_SKILLS_DIR?.trim();
  return envDir ? path.resolve(envDir) : path.resolve(process.cwd(), DEFAULT_BUILTIN_DIR);
}

function getUserDir(): string {
  return path.resolve(process.cwd(), DEFAULT_USER_DIR);
}

function readSkillMetadata(skillDir: string): SkillMeta | null {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;

  const content = fs.readFileSync(skillMdPath, 'utf-8');

  try {
    const { metadata } = parseFrontmatter(content);
    return {
      name: metadata.name,
      description: metadata.description,
      version: metadata.version,
    };
  } catch {
    return null;
  }
}

type SkillMeta = { name: string; description: string; version: string };

function formatSkillList(skills: SkillMeta[], title: string): void {
  if (skills.length === 0) return;
  console.log(`\n  ${title}:\n`);
  for (const skill of skills) {
    console.log(`    • ${skill.name}  ${skill.version ? `v${skill.version}` : ''}`);
    if (skill.description) {
      console.log(`      ${skill.description}`);
    }
  }
}

function listSkillsInDir(dir: string): SkillMeta[] {
  if (!fs.existsSync(dir)) return [];

  const skills: SkillMeta[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = readSkillMetadata(path.join(dir, entry.name));
    if (meta) {
      skills.push(meta);
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================
// skill add
// ============================================

const addCommand = new Command('add')
  .description('Install skills from a GitHub repository')
  .argument('<source>', 'GitHub repository (owner/repo or URL)')
  .option('-s, --skill <names...>', 'Install specific skills by name')
  .option('-l, --list', 'List available skills without installing')
  .action(async (source: string, options: { skill?: string[]; list?: boolean }) => {
    try {
      const { result, discovered } = await installFromSource(source, {
        listOnly: options.list,
        skills: options.skill,
      });

      if (options.list) {
        console.log(`\n  Available skills in "${source}":\n`);
        for (const skill of discovered) {
          console.log(`    • ${skill.name}`);
        }
        console.log();
        return;
      }

      const total = result.installed.length + result.updated.length;
      if (total === 0) {
        console.log('\n  No skills installed.');
        if (result.skipped.length > 0) {
          console.log(`  Skipped (not found): ${result.skipped.join(', ')}`);
        }
        return;
      }

      if (result.installed.length > 0) {
        console.log(`\n  ✓ Installed: ${result.installed.join(', ')}`);
      }
      if (result.updated.length > 0) {
        console.log(`  ✓ Updated: ${result.updated.join(', ')}`);
      }
      if (result.skipped.length > 0) {
        console.log(`  ⚠ Skipped: ${result.skipped.join(', ')}`);
      }
      console.log();
    } catch (error) {
      console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    }
  });

// ============================================
// skill list
// ============================================

const listCommand = new Command('list')
  .description('List installed skills')
  .action(() => {
    const builtinSkills = listSkillsInDir(getBuiltinDir());
    const userSkills = listSkillsInDir(getUserDir());

    if (builtinSkills.length === 0 && userSkills.length === 0) {
      console.log('\n  No skills installed.\n');
      return;
    }

    formatSkillList(builtinSkills, 'Built-in skills');
    formatSkillList(userSkills, 'User skills');
    console.log();
  });

// ============================================
// skill remove
// ============================================

const removeCommand = new Command('remove')
  .description('Remove a user-installed skill')
  .argument('<name>', 'Skill name to remove')
  .action((name: string) => {
    const userDir = getUserDir();
    const builtinDir = getBuiltinDir();
    const skillPath = path.join(userDir, name);

    // 路径穿越检查
    const resolvedSkill = path.resolve(skillPath);
    const resolvedUserDir = path.resolve(userDir);
    if (!resolvedSkill.startsWith(resolvedUserDir + path.sep) && resolvedSkill !== resolvedUserDir) {
      console.error(`\n  ✗ Invalid skill name: "${name}"\n`);
      process.exit(1);
    }

    // 检查是否是内置技能
    const builtinSkillPath = path.join(builtinDir, name);
    if (fs.existsSync(builtinSkillPath)) {
      console.error(`\n  ✗ Cannot remove built-in skill: ${name}. Use 'skill remove' only for user-installed skills.\n`);
      process.exit(1);
    }

    // 检查用户技能是否存在
    if (!fs.existsSync(skillPath)) {
      console.error(`\n  ✗ Skill not found: ${name}\n`);
      process.exit(1);
    }

    try {
      fs.rmSync(skillPath, { recursive: true, force: true });
      console.log(`\n  ✓ Removed: ${name}\n`);
    } catch (error) {
      console.error(`\n  ✗ Failed to remove ${name}: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    }
  });

// ============================================
// skill command group
// ============================================

export function createSkillCommand(): Command {
  return new Command('skill')
    .description('Manage skills (install, list, remove)')
    .addCommand(addCommand)
    .addCommand(listCommand)
    .addCommand(removeCommand);
}
