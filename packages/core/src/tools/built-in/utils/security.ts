/**
 * 安全检查工具函数
 *
 * 从 SecurityHooks 提取的独立安全逻辑，供内置工具复用。
 * 包含：危险命令检查、敏感文件检查、路径约束、SSRF 防护、命令策略校验。
 */

import { resolve, isAbsolute, relative, basename } from 'node:path';
import dns from 'node:dns';

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
  { pattern: /rm\s+(-[rfRF]+\s+.*\/|^rm\s+(-[rfRF]+)\s+\/)/, description: 'Recursive delete root directory' },
  { pattern: /rm\s+(-[rfRF]+\s+.*~|^rm\s+(-[rfRF]+)\s+~)/, description: 'Recursive delete home directory' },
  { pattern: />\s*\/dev\/sd[a-z]/, description: 'Overwrite disk device' },
  { pattern: /mkfs\.(ext[234]|xfs|btrfs|ntfs)/, description: 'Format filesystem' },
  { pattern: /dd\s+if=.*of=\/dev/, description: 'DD write to device' },
  { pattern: /:\(\)\s*\{.*\|.*&\s*\}\s*;/, description: 'Fork bomb' },
  { pattern: /chmod\s+-R\s+777/, description: 'Recursive chmod 777' },
  { pattern: /chown\s+-R/, description: 'Recursive chown' },
  { pattern: /curl.*(\||&&).*\s*(sudo\s+)?\s*(bash|sh|zsh)/, description: 'Pipe remote script execution' },
  { pattern: /wget.*(\||&&).*\s*(sudo\s+)?\s*(bash|sh|zsh)/, description: 'Pipe remote script execution' },
  { pattern: /\b(nc|ncat|netcat|socat)\b/, description: 'Potential reverse shell/tunnel tool' },
  { pattern: /\b(systemctl|service|launchctl)\b/, description: 'System service management' },
  { pattern: /\b(insmod|rmmod|modprobe)\b/, description: 'Kernel module operation' },
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
  // Filename-based patterns (match via basename to avoid path segment false positives)
  { pattern: /^\.env(\.|$)/, description: 'Environment variable file', allowRead: false, allowWrite: false },
  { pattern: /^id_rsa(\.|$)/, description: 'SSH private key', allowRead: false, allowWrite: false },
  { pattern: /^id_ed25519(\.|$)/, description: 'ED25519 private key', allowRead: false, allowWrite: false },
  { pattern: /\.pem$/i, description: 'PEM certificate', allowRead: false, allowWrite: false },
  { pattern: /\.key$/i, description: 'Key file', allowRead: false, allowWrite: false },
  { pattern: /^credentials(\.\w+)?\.json$/i, description: 'Credentials file', allowRead: false, allowWrite: false },
  { pattern: /^secret(s)?\.(json|yaml|yml)$/i, description: 'Secret config', allowRead: false, allowWrite: false },
  // Path-based patterns (match full path)
  { pattern: /\/\.ssh\//, description: 'SSH key directory', allowRead: false, allowWrite: false },
  { pattern: /\/etc\/passwd$/, description: 'System password file', allowRead: false, allowWrite: false },
  { pattern: /\/etc\/shadow$/, description: 'System shadow password file', allowRead: false, allowWrite: false },
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
 * 检查 IP 地址是否为私网/保留地址
 *
 * 覆盖范围：RFC 1918 私网、loopback、link-local、IPv6 本地。
 */
function isPrivateAddress(ip: string): boolean {
  // IPv4
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip)) return true;
  if (/^127\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^0\./.test(ip)) return true;
  if (/^22[4-9]\./.test(ip) || /^23[0-9]\./.test(ip)) return true; // 224.0.0.0/4 组播/保留

  // IPv6
  if (ip === '::1' || ip === '::') return true;
  if (/^fe80:/i.test(ip)) return true;   // link-local
  if (/^fc00:/i.test(ip) || /^fd00:/i.test(ip)) return true; // ULA

  return false;
}

/**
 * 检查 hostname 是否解析到私有 IP
 *
 * 通过 DNS 解析 hostname，检查所有解析结果是否为私网地址。
 */
export async function isPrivateIP(hostname: string): Promise<boolean> {
  try {
    const addresses = await dns.promises.resolve4(hostname);
    return addresses.some(addr => isPrivateAddress(addr));
  } catch {
    // DNS 解析失败（如非域名），检查是否为 IP 字面量
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return isPrivateAddress(hostname);
    }
    // IPv6 字面量检查
    if (/^::1$/.test(hostname) || /^::$/.test(hostname)) {
      return true;
    }
    if (/^fe80:/i.test(hostname) || /^fc00:/i.test(hostname) || /^fd00:/i.test(hostname)) {
      return true;
    }
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
      return { allowed: false, reason: `URL scheme not allowed: ${parsed.protocol} (only https:// is allowed)` };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'Invalid URL format' };
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
  const fileName = basename(filePath);

  for (const p of SENSITIVE_FILES) {
    // 路径级模式（包含 /）用完整路径匹配
    // 文件名级模式（以 ^ 或 \. 开头/结尾）用 basename 匹配
    const isPathPattern = p.pattern.source.includes('/');
    const target = isPathPattern ? filePath : fileName;

    if (p.pattern.test(target)) {
      const allowed = operation === 'read' ? p.allowRead : p.allowWrite;
      if (!allowed) {
        return { sensitive: true, description: p.description };
      }
    }
  }
  return { sensitive: false };
}

