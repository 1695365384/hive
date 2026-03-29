/**
 * 安全检查工具函数
 *
 * 从 SecurityHooks 提取的独立安全逻辑，供内置工具复用。
 */

/**
 * 危险命令模式
 */
interface DangerousPattern {
  pattern: RegExp;
  description: string;
}

/**
 * 敏感文件模式
 */
interface SensitivePattern {
  pattern: RegExp;
  description: string;
  allowRead: boolean;
  allowWrite: boolean;
}

const DANGEROUS_COMMANDS: DangerousPattern[] = [
  { pattern: /rm\s+-rf\s+\//, description: '递归删除根目录' },
  { pattern: /rm\s+-rf\s+~/, description: '递归删除用户目录' },
  { pattern: />\s*\/dev\/sd[a-z]/, description: '覆盖磁盘设备' },
  { pattern: /mkfs\.(ext[234]|xfs|btrfs|ntfs)/, description: '格式化文件系统' },
  { pattern: /dd\s+if=.*of=\/dev/, description: 'DD 写入设备' },
  { pattern: /:\(\)\s*\{.*\|.*&\s*\}\s*;/, description: 'Fork 炸弹' },
  { pattern: /chmod\s+-R\s+777\s+\//, description: '递归设置全权限' },
  { pattern: /chown\s+-R.*\//, description: '递归修改所有者' },
  { pattern: /curl.*\|\s*(sudo\s+)?bash/, description: '管道执行远程脚本' },
  { pattern: /wget.*\|\s*(sudo\s+)?bash/, description: '管道执行远程脚本' },
];

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
