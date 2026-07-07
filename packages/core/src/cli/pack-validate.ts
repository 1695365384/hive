/**
 * hive-pack validate — 校验 Vertical Pack 是否合规
 *
 * 检查项：
 *   1. 能否成功加载（dist/index.js 或 src/index.ts）
 *   2. 导出的对象是否符合 VerticalPack 接口（id/name/version 必填）
 *   3. 至少包含一个扩展点（tools/agents/skills/capabilities/hooks）
 *   4. 声明的 dependencies 格式正确
 *   5. 工具名格式合法（小写字母+连字符）
 *
 * 退出码：0 = 通过，1 = 校验失败
 */

import { access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ValidateArgs } from './pack-cli.js';
import type { VerticalPack } from '../vertical/types.js';

interface CheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** 检查路径是否存在（替代 fs-extra 的 pathExists） */
async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function runValidate(args: ValidateArgs): Promise<void> {
  const { dir } = args;
  const result: CheckResult = { ok: true, errors: [], warnings: [] };

  console.log(`\n🔍 校验 Vertical Pack: ${dir}\n`);

  // 1. 找到入口文件
  const entry = await findEntry(dir);
  if (!entry) {
    result.ok = false;
    result.errors.push('找不到入口文件：dist/index.js 或 src/index.ts 都不存在');
    printResult(result);
    process.exit(1);
  }
  console.log(`   入口: ${entry.relativePath}`);

  // 2. 加载 pack
  let pack: unknown;
  try {
    const mod = await import(pathToFileURL(entry.absolutePath).href);
    // 支持默认导出或命名导出
    pack = mod.default ?? mod.Pack ?? null;
    // 如果没找到默认导出，尝试找第一个实现 VerticalPack 的导出
    if (!pack) {
      for (const key of Object.keys(mod)) {
        const candidate = mod[key];
        if (isVerticalPack(candidate)) {
          pack = candidate;
          break;
        }
      }
    }
  } catch (err) {
    result.ok = false;
    result.errors.push(
      `加载失败: ${err instanceof Error ? err.message : String(err)}。请先运行 pnpm build。`,
    );
    printResult(result);
    process.exit(1);
  }

  // 3. 接口校验
  if (!pack) {
    result.ok = false;
    result.errors.push('未找到 VerticalPack 导出（需要 default export 或命名导出）');
    printResult(result);
    process.exit(1);
  }

  validatePack(pack, result);

  printResult(result);
  process.exit(result.ok ? 0 : 1);
}

// ============================================
// 入口文件查找
// ============================================

async function findEntry(
  dir: string,
): Promise<{ absolutePath: string; relativePath: string } | null> {
  // 优先 dist/index.js（编译产物）
  const distEntry = join(dir, 'dist', 'index.js');
  if (await pathExists(distEntry)) {
    return { absolutePath: distEntry, relativePath: 'dist/index.js' };
  }

  // 其次 dist/index.mjs
  const distMjs = join(dir, 'dist', 'index.mjs');
  if (await pathExists(distMjs)) {
    return { absolutePath: distMjs, relativePath: 'dist/index.mjs' };
  }

  // 回退到 package.json 的 main 字段
  try {
    const pkgPath = join(dir, 'package.json');
    if (await pathExists(pkgPath)) {
      const { readFile } = await import('node:fs/promises');
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
      if (pkg.main) {
        const mainPath = join(dir, pkg.main);
        if (await pathExists(mainPath)) {
          return { absolutePath: mainPath, relativePath: pkg.main };
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

// ============================================
// 接口校验
// ============================================

function isVerticalPack(obj: unknown): obj is VerticalPack {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj &&
    'version' in obj
  );
}

function validatePack(pack: unknown, result: CheckResult): void {
  if (!isVerticalPack(pack)) {
    result.ok = false;
    result.errors.push('导出的对象不符合 VerticalPack 接口（缺少 id/name/version）');
    return;
  }

  // 必填字段
  if (!pack.id || typeof pack.id !== 'string') {
    result.errors.push('id 必须是非空字符串');
  } else if (!/^[a-z][a-z0-9-]*$/.test(pack.id)) {
    result.warnings.push(
      `id "${pack.id}" 建议只用小写字母、数字、连字符（便于依赖引用）`,
    );
  }

  if (!pack.name || typeof pack.name !== 'string') {
    result.errors.push('name 必须是非空字符串');
  }

  if (!pack.version || typeof pack.version !== 'string') {
    result.errors.push('version 必须是非空字符串（建议 SemVer 格式）');
  } else if (!/^\d+\.\d+\.\d+/.test(pack.version)) {
    result.warnings.push(`version "${pack.version}" 建议用 SemVer 格式（如 1.0.0）`);
  }

  // 至少一个扩展点
  const extensionPoints = ['tools', 'agents', 'skills', 'capabilities', 'hooks'];
  const packRecord = pack as unknown as Record<string, unknown>;
  const hasAny = extensionPoints.some(
    (key) => Array.isArray(packRecord[key]) && (packRecord[key] as unknown[]).length > 0,
  );
  if (!hasAny) {
    result.warnings.push(
      '没有声明任何扩展点（tools/agents/skills/capabilities/hooks 全空）。这个 pack 注册后不会做任何事。',
    );
  }

  // 扩展点类型检查
  for (const key of extensionPoints) {
    const val = packRecord[key];
    if (val !== undefined && !Array.isArray(val)) {
      result.errors.push(`${key} 必须是数组，当前是 ${typeof val}`);
    }
  }

  // dependencies 格式
  if (pack.dependencies !== undefined) {
    if (!Array.isArray(pack.dependencies)) {
      result.errors.push('dependencies 必须是字符串数组');
    } else {
      for (const dep of pack.dependencies) {
        if (typeof dep !== 'string' || !dep) {
          result.errors.push(`dependencies 中的每个元素必须是非空字符串，发现: ${JSON.stringify(dep)}`);
        }
      }
    }
  }

  // 工具名格式
  if (Array.isArray(pack.tools)) {
    for (const t of pack.tools) {
      if (
        t &&
        typeof t === 'object' &&
        'name' in t &&
        typeof t.name === 'string' &&
        !/^[a-z][a-z0-9-]*$/.test(t.name)
      ) {
        result.warnings.push(`工具名 "${t.name}" 建议只用小写字母、数字、连字符`);
      }
    }
  }

  result.ok = result.errors.length === 0;
}

// ============================================
// 输出
// ============================================

function printResult(result: CheckResult): void {
  console.log('');
  if (result.errors.length > 0) {
    console.log('❌ 校验失败：\n');
    for (const e of result.errors) {
      console.log(`   ✗ ${e}`);
    }
  }
  if (result.warnings.length > 0) {
    console.log('\n⚠️  警告：\n');
    for (const w of result.warnings) {
      console.log(`   ⚠ ${w}`);
    }
  }
  if (result.ok && result.warnings.length === 0) {
    console.log('✅ 校验通过，pack 结构合规\n');
  } else if (result.ok) {
    console.log('\n✅ 校验通过（有警告但不阻塞）\n');
  }
}
