#!/usr/bin/env node
/**
 * hive-pack CLI 入口
 *
 * 用法：
 *   hive-pack init <name>     生成一个新的 Vertical Pack 骨架
 *   hive-pack validate [dir]  校验当前目录（或指定目录）的 pack 是否合规
 *   hive-pack --help          帮助
 *   hive-pack --version       版本
 *
 * 通过 package.json 的 bin 字段注册为全局命令。
 */

import { resolve } from 'node:path';
import { runInit } from './pack-init.js';
import { runValidate } from './pack-validate.js';

const HELP = `
hive-pack — Hive Vertical Pack 脚手架

用法：
  hive-pack init <name> [options]    生成一个新的 pack 骨架
    --dir <path>                     目标目录（默认 ./<name>）
    --description <text>             pack 描述

  hive-pack validate [dir]           校验 pack 是否符合 VerticalPack 接口
    （dir 默认当前目录，会加载 dist/index.js 或 src/index.ts）

  hive-pack --help                   显示此帮助
  hive-pack --version                显示版本

示例：
  hive-pack init legal-assistant --description "法务助手"
  cd legal-assistant
  hive-pack validate
`;

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    // 从 package.json 读版本（CLI 作为 core 的一部分发布）
    try {
      const pkg = await import('../../package.json', { with: { type: 'json' } });
      console.log(pkg.default?.version ?? pkg.version ?? 'unknown');
    } catch {
      console.log('unknown');
    }
    return;
  }

  const command = args[0];

  switch (command) {
    case 'init':
      await runInit(parseInitArgs(args.slice(1)));
      break;
    case 'validate':
      await runValidate(parseValidateArgs(args.slice(1)));
      break;
    default:
      console.error(`未知命令: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

export interface InitArgs {
  name: string;
  dir?: string;
  description?: string;
}

function parseInitArgs(args: string[]): InitArgs {
  const result: InitArgs = { name: '' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dir') {
      result.dir = args[++i];
    } else if (arg === '--description') {
      result.description = args[++i];
    } else if (!arg.startsWith('-')) {
      result.name = arg;
    }
  }
  if (!result.name) {
    throw new Error('init 需要一个 pack 名称，例如: hive-pack init legal-assistant');
  }
  if (!/^[a-z][a-z0-9-]*$/.test(result.name)) {
    throw new Error(
      `pack 名称只能包含小写字母、数字、连字符，且以字母开头: "${result.name}"`,
    );
  }
  result.dir = result.dir ? resolve(result.dir) : resolve(process.cwd(), result.name);
  return result;
}

export interface ValidateArgs {
  dir: string;
}

function parseValidateArgs(args: string[]): ValidateArgs {
  const dir = args.find((a) => !a.startsWith('-'));
  return { dir: dir ? resolve(dir) : resolve(process.cwd()) };
}
