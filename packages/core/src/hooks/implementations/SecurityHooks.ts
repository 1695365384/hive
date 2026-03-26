/**
 * 安全检查 Hooks
 *
 * 提供：
 * - 危险命令阻止
 * - 敏感文件保护
 * - 权限验证
 * - 网络请求控制
 */

import {
  type HookRegistry,
  type HookPriority,
  type ToolBeforeHookContext,
  type HookResult,
  type ToolBeforeHookModifiedContext,
} from '../index.js';

/**
 * 危险命令模式配置
 */
export interface DangerousCommandPattern {
  /** 正则表达式 */
  pattern: RegExp;
  /** 描述 */
  description: string;
  /** 严重程度 */
  severity: 'critical' | 'high' | 'medium';
}

/**
 * 敏感文件模式配置
 */
export interface SensitiveFilePattern {
  /** 正则表达式 */
  pattern: RegExp;
  /** 描述 */
  description: string;
  /** 是否允许读取 */
  allowRead: boolean;
  /** 是否允许写入 */
  allowWrite: boolean;
}

/**
 * 安全检查配置
 */
export interface SecurityHooksConfig {
  /** 是否启用危险命令检查 */
  enableDangerousCommandCheck?: boolean;
  /** 自定义危险命令模式 */
  customDangerousPatterns?: DangerousCommandPattern[];
  /** 是否启用敏感文件保护 */
  enableSensitiveFileProtection?: boolean;
  /** 自定义敏感文件模式 */
  customSensitivePatterns?: SensitiveFilePattern[];
  /** 是否启用网络请求控制 */
  enableNetworkControl?: boolean;
  /** 允许的网络域名白名单 */
  allowedDomains?: string[];
  /** 被拒绝的命令记录回调 */
  onCommandBlocked?: (command: string, pattern: string, context: ToolBeforeHookContext) => void;
  /** 被拒绝的文件访问回调 */
  onFileAccessBlocked?: (path: string, operation: string, context: ToolBeforeHookContext) => void;
}

/**
 * 默认危险命令模式
 */
const DEFAULT_DANGEROUS_PATTERNS: DangerousCommandPattern[] = [
  { pattern: /rm\s+-rf\s+\//, description: '递归删除根目录', severity: 'critical' },
  { pattern: /rm\s+-rf\s+~/, description: '递归删除用户目录', severity: 'critical' },
  { pattern: />\s*\/dev\/sd[a-z]/, description: '覆盖磁盘设备', severity: 'critical' },
  { pattern: /mkfs\.(ext[234]|xfs|btrfs|ntfs)/, description: '格式化文件系统', severity: 'critical' },
  { pattern: /dd\s+if=.*of=\/dev/, description: 'DD 写入设备', severity: 'critical' },
  { pattern: /:\(\)\{.*:\|:&\};:/, description: 'Fork 炸弹', severity: 'critical' },
  { pattern: /chmod\s+-R\s+777\s+\//, description: '递归设置全权限', severity: 'high' },
  { pattern: /chown\s+-R.*\//, description: '递归修改所有者', severity: 'high' },
  { pattern: /curl.*\|\s*(sudo\s+)?bash/, description: '管道执行远程脚本', severity: 'high' },
  { pattern: /wget.*\|\s*(sudo\s+)?bash/, description: '管道执行远程脚本', severity: 'high' },
];

/**
 * 默认敏感文件模式
 */
const DEFAULT_SENSITIVE_PATTERNS: SensitiveFilePattern[] = [
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
 * 安全检查 Hooks 实现
 */
export class SecurityHooks {
  private registry: HookRegistry;
  private config: SecurityHooksConfig;
  private registeredHookIds: string[] = [];
  private dangerousPatterns: DangerousCommandPattern[];
  private sensitivePatterns: SensitiveFilePattern[];

  constructor(registry: HookRegistry, config: SecurityHooksConfig = {}) {
    this.registry = registry;
    this.config = config;
    this.dangerousPatterns = [
      ...DEFAULT_DANGEROUS_PATTERNS,
      ...(config.customDangerousPatterns || []),
    ];
    this.sensitivePatterns = [
      ...DEFAULT_SENSITIVE_PATTERNS,
      ...(config.customSensitivePatterns || []),
    ];
  }

  /**
   * 注册所有安全 Hooks
   */
  register(priority: HookPriority = 'highest'): void {
    // 注册危险命令检查 Hook
    if (this.config.enableDangerousCommandCheck !== false) {
      const id = this.registry.on(
        'tool:before',
        this.checkDangerousCommand.bind(this),
        { priority, description: '安全检查 - 危险命令阻止' }
      );
      this.registeredHookIds.push(id);
    }

    // 注册敏感文件保护 Hook
    if (this.config.enableSensitiveFileProtection !== false) {
      const id = this.registry.on(
        'tool:before',
        this.checkSensitiveFileAccess.bind(this),
        { priority, description: '安全检查 - 敏感文件保护' }
      );
      this.registeredHookIds.push(id);
    }

    // 注册网络请求控制 Hook
    if (this.config.enableNetworkControl) {
      const id = this.registry.on(
        'tool:before',
        this.checkNetworkRequest.bind(this),
        { priority, description: '安全检查 - 网络请求控制' }
      );
      this.registeredHookIds.push(id);
    }
  }

  /**
   * 注销所有安全 Hooks
   */
  unregister(): void {
    for (const id of this.registeredHookIds) {
      this.registry.off(id);
    }
    this.registeredHookIds = [];
  }

  /**
   * 检查危险命令
   */
  private async checkDangerousCommand(
    context: ToolBeforeHookContext
  ): Promise<HookResult<ToolBeforeHookModifiedContext>> {
    if (context.toolName !== 'Bash') {
      return { proceed: true };
    }

    const command = (context.input.command as string) || '';
    const dangerousPattern = this.dangerousPatterns.find(({ pattern }) => pattern.test(command));

    if (dangerousPattern) {
      this.config.onCommandBlocked?.(command, dangerousPattern.pattern.source, context);

      return {
        proceed: false,
        error: new Error(
          `[Security] 阻止危险命令: ${dangerousPattern.description} ` +
          `(严重程度: ${dangerousPattern.severity}, 模式: ${dangerousPattern.pattern.source})`
        ),
      };
    }

    return { proceed: true };
  }

  /**
   * 检查敏感文件访问
   */
  private async checkSensitiveFileAccess(
    context: ToolBeforeHookContext
  ): Promise<HookResult<ToolBeforeHookModifiedContext>> {
    const fileTools = ['Read', 'Write', 'Edit'];
    if (!fileTools.includes(context.toolName)) {
      return { proceed: true };
    }

    const filePath = this.extractFilePath(context);
    if (!filePath) {
      return { proceed: true };
    }

    const operation = this.getOperation(context.toolName);
    const sensitivePattern = this.sensitivePatterns.find(({ pattern }) => pattern.test(filePath));

    if (sensitivePattern) {
      const isAllowed = operation === 'read' ? sensitivePattern.allowRead : sensitivePattern.allowWrite;

      if (!isAllowed) {
        this.config.onFileAccessBlocked?.(filePath, operation, context);

        return {
          proceed: false,
          error: new Error(
            `[Security] 阻止敏感文件访问: ${sensitivePattern.description} ` +
            `(操作: ${operation}, 路径: ${filePath})`
          ),
        };
      }
    }

    return { proceed: true };
  }

  /**
   * 检查网络请求
   */
  private async checkNetworkRequest(
    context: ToolBeforeHookContext
  ): Promise<HookResult<ToolBeforeHookModifiedContext>> {
    // 检查 Bash 中的 curl/wget 命令
    if (context.toolName === 'Bash') {
      const command = (context.input.command as string) || '';
      const urlMatch = command.match(/(?:curl|wget)\s+(?:-[^\s]+\s+)*([^\s]+)/);

      if (urlMatch && this.config.allowedDomains) {
        const url = urlMatch[1];
        const domain = this.extractDomain(url);

        if (domain && !this.config.allowedDomains.includes(domain)) {
          return {
            proceed: false,
            error: new Error(
              `[Security] 阻止未授权的网络请求: 域名 ${domain} 不在白名单中`
            ),
          };
        }
      }
    }

    return { proceed: true };
  }

  /**
   * 从上下文中提取文件路径
   */
  private extractFilePath(context: ToolBeforeHookContext): string | null {
    const input = context.input;
    return (input.file_path as string) ||
           (input.path as string) ||
           (input.filePath as string) ||
           null;
  }

  /**
   * 获取操作类型
   */
  private getOperation(toolName: string): 'read' | 'write' {
    return toolName === 'Read' ? 'read' : 'write';
  }

  /**
   * 从 URL 中提取域名
   */
  private extractDomain(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      // 尝试简单提取
      const match = url.match(/^(?:https?:\/\/)?([^\/:\?]+)/);
      return match ? match[1] : null;
    }
  }

  /**
   * 获取已注册的 Hook IDs
   */
  getRegisteredHookIds(): string[] {
    return [...this.registeredHookIds];
  }

  /**
   * 添加危险命令模式
   */
  addDangerousPattern(pattern: DangerousCommandPattern): void {
    this.dangerousPatterns.push(pattern);
  }

  /**
   * 添加敏感文件模式
   */
  addSensitivePattern(pattern: SensitiveFilePattern): void {
    this.sensitivePatterns.push(pattern);
  }

  /**
   * 移除危险命令模式
   */
  removeDangerousPattern(pattern: RegExp): boolean {
    const index = this.dangerousPatterns.findIndex(p => p.pattern.source === pattern.source);
    if (index !== -1) {
      this.dangerousPatterns.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 移除敏感文件模式
   */
  removeSensitivePattern(pattern: RegExp): boolean {
    const index = this.sensitivePatterns.findIndex(p => p.pattern.source === pattern.source);
    if (index !== -1) {
      this.sensitivePatterns.splice(index, 1);
      return true;
    }
    return false;
  }
}

/**
 * 创建安全 Hooks 实例
 */
export function createSecurityHooks(
  registry: HookRegistry,
  config?: SecurityHooksConfig
): SecurityHooks {
  return new SecurityHooks(registry, config);
}
