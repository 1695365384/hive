/**
 * 工具权限分类与定义
 *
 * 将所有工具按权限等级分类：
 * - SAFE: 安全工具，可直接调用
 * - RESTRICTED: 受限工具，需要审计日志
 * - DANGEROUS: 危险工具，需要人工确认或拒绝
 */

/**
 * 工具权限等级
 */
export type ToolPermissionLevel = 'safe' | 'restricted' | 'dangerous';

/**
 * 工具权限映射
 */
export const TOOL_PERMISSIONS: Record<ToolPermissionLevel, string[]> = {
  // 🟢 SAFE - 安全工具，可直接调用
  safe: [
    'read-file',
    'grep-search',
    'list-dir',
    'web-fetch',
    'file-search',
    'semantic-search',
  ],

  // 🟡 RESTRICTED - 受限工具，需要记录审计日志
  restricted: [
    'write-file',
    'create-dir',
    'create-file',
    'run-command',
    'git-push',
    'install-package',
    'edit-file',
    'replace-string-in-file',
  ],

  // 🔴 DANGEROUS - 危险工具，需要人工审核或预算确认
  dangerous: [
    'delete-file',
    'delete-dir',
    'kill-process',
    'modify-config',
    'publish-release',
    'run-command-with-root',
  ],
} as const;

/**
 * 工具权限描述
 */
export const TOOL_PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'delete-file': '删除文件系统中的文件 (无法恢复)',
  'delete-dir': '删除整个目录 (无法恢复)',
  'kill-process': '终止进程 (可能导致服务中断)',
  'modify-config': '修改系统/应用配置文件 (可能影响系统行为)',
  'publish-release': '发布版本到公网 (不可撤销)',
  'run-command-with-root': '使用 root 权限执行命令 (最高风险)',
  'run-command': '执行任意系统命令',
  'git-push': '推送代码到远程仓库',
  'install-package': '安装系统或项目依赖',
};

/**
 * 获取工具的权限等级
 */
export function getToolPermissionLevel(toolName: string): ToolPermissionLevel {
  for (const [level, tools] of Object.entries(TOOL_PERMISSIONS)) {
    if (tools.includes(toolName)) {
      return level as ToolPermissionLevel;
    }
  }
  // 未知工具默认为 SAFE
  return 'safe';
}

/**
 * 获取工具描述
 */
export function getToolDescription(toolName: string): string {
  return TOOL_PERMISSION_DESCRIPTIONS[toolName] || toolName;
}

/**
 * 检查工具是否需要人工确认
 */
export function requiresUserConfirmation(toolName: string): boolean {
  return getToolPermissionLevel(toolName) === 'dangerous';
}

/**
 * 检查工具是否需要记录审计日志
 */
export function requiresAuditLogging(toolName: string): boolean {
  const level = getToolPermissionLevel(toolName);
  return level === 'restricted' || level === 'dangerous';
}
