/**
 * 安全检查工具函数
 *
 * 从 SecurityHooks 提取的独立安全逻辑，供内置工具复用。
 * 包含：危险命令检查、敏感文件检查、路径约束、SSRF 防护、命令策略校验。
 */

import { resolve, isAbsolute, relative } from 'node:path';
import { resolve4, resolve6 } from 'node:dns/promises';

// ============================================
// 常量
// ============================================

/** 默认允许的工作目录根路径（延迟初始化） */
let _allowedRoots: string[] | null = null;

/** 默认 bash 命令 allowlist */
const DEFAULT_BASH_ALLOWLIST = [
  'git', 'npm', 'pnpm', 'node', 'npx', 'bun',
  'cat', 'less', 'head', 'tail', 'wc', 'sort', 'uniq', 'tee',
  'ls', 'find', 'which', 'pwd', 'cd', 'test', 'echo', 'printf',
  'mkdir', 'cp', 'mv', 'rm', 'rmdir', 'touch', 'chmod',
  'grep', 'sed', 'awk', 'diff', 'patch', 'cut', 'tr', 'xargs',
  'env', 'export', 'unset', 'source', 'type',
  'tar', 'zip', 'unzip', 'gzip', 'gunzip', 'zcat',
  'curl', 'wget',
  'docker', 'docker-compose',
  'npm', 'yarn', 'pnpm',
  'vitest', 'jest', 'mocha', 'pytest', 'go', 'cargo', 'rustc',
  'sleep', 'timeout', 'time',
];

/** 私有 IP 段 */
const PRIVATE_RANGES = [
  { start: [127, 0, 0, 0], end: [127, 255, 255, 255] },
  { start: [10, 0, 0, 0], end: [10, 255, 255, 255] },
  { start: [172, 16, 0, 0], end: [172, 31, 255, 255] },
  { start: [192, 168, 0, 0], end: [192, 168, 255, 255] },
  { start: [169, 254, 0, 0], end: [169, 254, 255, 255] },
  { start: [0, 0, 0, 0], end: [0, 0, 0, 0] },
  { start: [0, 0, 0, 1], end: [0, 0, 0, 1] },
];

// ============================================
// 危险命令模式
// ============================================

interface DangerousPattern {
  pattern: RegExp;
  description: string;
}

const DANGEROUS_COMMANDS: DangerousPattern[] = [
  { pattern: /rm\s+(-[rfRF]+\s+.*\/|^rm\s+(-[rfRF]+)\s+\/)/, description: '递归删除根目录' },
  { pattern: /rm\s+(-[rfRF]+\s+.*~|^rm\s+(-[rfRF]+)\s+~)/, description: '递归删除用户目录' },
  { pattern: />\s*\/dev\/sd[a-z]/, description: '覆盖磁盘设备' },
  { pattern: /mkfs\.(ext[234]|xfs|btrfs|ntfs)/, description: '格式化文件系统' },
  { pattern: /dd\s+if=.*of=\/dev/, description: 'DD 写入设备' },
  { pattern: /:\(\)\s*\{.*\|.*&\s*\}\s*;/, description: 'Fork 炸弹' },
  { pattern: /chmod\s+-R\s+777/, description: '递归设置全权限' },
  { pattern: /chown\s+-R/, description: '递归修改所有者' },
  { pattern: /curl.*(\||&&).*\s*(sudo\s+)?\s*(bash|sh|zsh)/, description: '管道执行远程脚本' },
  { pattern: /wget.*(\||&&).*\s*(sudo\s+)?\s*(bash|sh|zsh)/, description: '管道执行远程脚本' },
  { pattern: /\b(bash|sh|zsh)\b\s+-c\s+["']\s*(\.|\/|~)/, description: 'Shell -c 执行路径脚本' },
  { pattern: /\b(python|python2|python3)\b\s+-c\b/, description: 'Python 内联代码执行' },
  { pattern: /\b(node|nodejs)\b\s+-e\b/, description: 'Node.js 内联代码执行' },
  { pattern: /\bperl\b\s+-e\b/, description: 'Perl 内联代码执行' },
  { pattern: /\bruby\b\s+-e\b/, description: 'Ruby 内联代码执行' },
  { pattern: /\bphp\b\s+-r\b/, description: 'PHP 内联代码执行' },
  { pattern: /\b(nc|ncat|netcat|socat)\b/, description: '潜在反弹 shell/隧道工具' },
  { pattern: /\b(systemctl|service|launchctl)\b/, description: '系统服务管理命令' },
  { pattern: /\b(insmod|rmmod|modprobe)\b/, description: '内核模块操作' },
  { pattern: /\$\([^)]+\)/, description: '命令替换' },
  { pattern: /`[^`]+`/, description: '反引号命令替换' },
];

// ============================================
// 敏感文件模式
// ============================================

interface SensitivePattern {
  pattern: RegExp;
  description: string;
  allowRead: boolean;
  allowWrite: boolean;
}

const SENSITIVE_FILES: SensitivePattern[] = [
  { pattern: /\.env(\.|$)/, description: '环境变量文件', allowRead: false, allowWrite: false },
  { pattern: /\/\.ssh\//, description: 'SSH 密钥目录', allowRead: false, allowWrite: false },
  { pattern: /id_rsa(\.|$)/, description: 'SSH 私钥', allowRead: false, allowWrite: false },
  { pattern: /id_ed25519(\.|$)/, description: 'ED25519 私钥', allowRead: false, allowWrite: false },
  { pattern: /\.pem(\.|$)/, description: 'PEM 证书', allowRead: false, allowWrite: false },
  { pattern: /\.key(\.|$)/, description: '密钥文件', allowRead: false, allowWrite: false },
  { pattern: /credentials\.json$/, description: '凭证文件', allowRead: false, allowWrite: false },
  { pattern: /secrets?\.(json|yaml|yml)$/, description: '机密配置', allowRead: false, allowWrite: false },
  { pattern: /\/etc\/passwd$/, description: '系统密码文件', allowRead: false, allowWrite: false },
  { pattern: /\/etc\/shadow$/, description: '系统影子密码文件', allowRead: false, allowWrite: false },
];

// ============================================
// 路径约束
// ============================================

/**
 * 获取允许的工作目录根路径列表
 */
function getAllowedRoots(): string[] {
  if (_allowedRoots) return _allowedRoots;

  const envDir = process.env.HIVE_WORKING_DIR;
  if (envDir) {
    _allowedRoots = envDir.split(':').map(d => resolve(d)).filter(Boolean);
  } else {
    _allowedRoots = [process.cwd()];
  }

  return _allowedRoots;
}

/**
 * 重置缓存的根路径（用于测试）
 */
export function _resetAllowedRoots(): void {
  _allowedRoots = null;
}

/**
 * 检查路径是否在允许的根目录内
 */
export function isPathAllowed(filePath: string): boolean {
  const resolved = resolve(filePath);

  for (const root of getAllowedRoots()) {
    const rel = relative(root, resolved);
    if (!rel.startsWith('..') && !isAbsolute(rel)) {
      return true;
    }
  }

  return false;
}

// ============================================
// SSRF 防护
// ============================================

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return false;

  return PRIVATE_RANGES.some(({ start, end }) => {
    for (let i = 0; i < 4; i++) {
      if (parts[i]! < start[i] || parts[i]! > end[i]) return false;
    }
    return true;
  });
}

/**
 * 检查 hostname 是否解析到私有 IP
 */
export async function isPrivateIP(
  hostname: string,
  resolvers?: { resolve4?: typeof resolve4; resolve6?: typeof resolve6 },
): Promise<boolean> {
  const r4 = resolvers?.resolve4 ?? resolve4;
  const r6 = resolvers?.resolve6 ?? resolve6;

  try {
    const [v4Addresses, v6Addresses] = await Promise.all([
      r4(hostname).catch(() => [] as string[]),
      r6(hostname).catch(() => [] as string[]),
    ]);

    for (const addr of v4Addresses) {
      if (isPrivateIPv4(addr)) {
        return true;
      }
    }

    for (const addr of v6Addresses) {
      if (addr === '::1') {
        return true;
      }
      // fc00::/7 — 仅检查 ::1，完整 fc00 范围需要更复杂处理
    }

    return false;
  } catch {
    // DNS 解析失败，允许请求通过（保守策略：不因 DNS 失败阻止正常请求）
    return false;
  }
}

/**
 * 校验 URL 是否为允许的 HTTP scheme
 */
export function isAllowedUrl(url: string): { allowed: boolean; reason?: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return { allowed: false, reason: `不允许的 URL scheme: ${parsed.protocol}（仅允许 https://）` };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: '无效的 URL 格式' };
  }
}

// ============================================
// 命令策略
// ============================================

type BashCommandPolicyMode = 'deny-dangerous' | 'allowlist';

function getBashCommandPolicyMode(): BashCommandPolicyMode {
  const rawMode = process.env.HIVE_BASH_COMMAND_POLICY?.trim().toLowerCase();
  if (rawMode === 'allowlist') return 'allowlist';
  if (rawMode === 'deny-dangerous') return 'deny-dangerous';

  // 兼容旧配置：若设置了 HIVE_BASH_ALLOWLIST，默认启用 allowlist 策略。
  if (process.env.HIVE_BASH_ALLOWLIST?.trim()) {
    return 'allowlist';
  }

  // 默认更少误杀：仅依赖高危命令检测进行拦截。
  return 'deny-dangerous';
}

function getBashAllowlist(): string[] {
  const envAllowlist = process.env.HIVE_BASH_ALLOWLIST;
  if (envAllowlist) {
    return envAllowlist.split(',').map(s => s.trim()).filter(Boolean);
  }
  return DEFAULT_BASH_ALLOWLIST;
}

/**
 * 检查命令是否允许执行
 *
 * 默认策略为 deny-dangerous（降低误杀，允许绝大多数非高危命令）。
 * 当启用 allowlist 策略时，提取命令的第一个词（如 `git status` → `git`）进行白名单校验。
 * 以 `/`、`.` 或 `~` 开头的命令（绝对路径、相对路径或用户目录脚本）始终拒绝。
 */
export function isCommandAllowed(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;

  const firstWord = trimmed.split(/\s+/)[0]!;
  const allowlist = getBashAllowlist();

  // 路径形式的命令（./script.sh, /usr/bin/xxx, ~/script.sh）始终拒绝
  if (firstWord.startsWith('/') || firstWord.startsWith('./') || firstWord.startsWith('../') || firstWord.startsWith('~')) {
    return false;
  }

  const policyMode = getBashCommandPolicyMode();
  if (policyMode === 'deny-dangerous') {
    return true;
  }

  return allowlist.includes(firstWord);
}

// ============================================
// 原有接口
// ============================================

/**
 * 检查命令是否危险
 */
export function isDangerousCommand(command: string): { dangerous: boolean; description?: string } {
  const match = DANGEROUS_COMMANDS.find(p => p.pattern.test(command));
  if (match) {
    return { dangerous: true, description: match.description };
  }
  return { dangerous: false };
}

/**
 * 检查文件路径是否敏感
 */
export function isSensitiveFile(filePath: string, operation: 'read' | 'write'): { sensitive: boolean; description?: string } {
  const match = SENSITIVE_FILES.find(p => p.pattern.test(filePath));
  if (match) {
    const allowed = operation === 'read' ? match.allowRead : match.allowWrite;
    if (!allowed) {
      return { sensitive: true, description: match.description };
    }
  }
  return { sensitive: false };
}
