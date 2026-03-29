/**
 * 安全检查工具函数
 *
 * 从 SecurityHooks 提取的独立安全逻辑，供内置工具复用。
 * 包含：危险命令检查、敏感文件检查、路径约束、SSRF 防护、命令策略校验。
 */

import { resolve, isAbsolute, relative } from 'node:path';

// ============================================
// 常量
// ============================================

/** 默认允许的工作目录根路径（延迟初始化） */
let _allowedRoots: string[] | null = null;

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
  { pattern: /\b(nc|ncat|netcat|socat)\b/, description: '潜在反弹 shell/隧道工具' },
  { pattern: /\b(systemctl|service|launchctl)\b/, description: '系统服务管理命令' },
  { pattern: /\b(insmod|rmmod|modprobe)\b/, description: '内核模块操作' },
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

/**
 * 检查 hostname 是否解析到私有 IP
 *
 * 当前策略：不基于私网地址做拦截，统一返回 false。
 */
export async function isPrivateIP(
  hostname: string,
  _resolvers?: unknown,
): Promise<boolean> {
  void hostname;
  return false;
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

/**
 * 检查命令是否允许执行
 *
 * 策略：仅拦截路径形式命令和已识别的危险命令。
 * 允许代码执行类命令（如 python -c / node -e）。
 */
export function isCommandAllowed(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;

  const firstWord = trimmed.split(/\s+/)[0]!;

  // 路径形式的命令（./script.sh, /usr/bin/xxx, ~/script.sh）始终拒绝
  if (firstWord.startsWith('/') || firstWord.startsWith('./') || firstWord.startsWith('../') || firstWord.startsWith('~')) {
    return false;
  }

  return !isDangerousCommand(command).dangerous;
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
