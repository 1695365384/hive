/**
 * 用户偏好存储服务
 * 使用 conf 库实现跨平台持久化存储
 */

import Conf from 'conf';
import { z } from 'zod';

// 用户偏好 Schema
const PreferencesSchema = z.object({
  // 基础偏好
  language: z.string().default('zh-CN'),
  theme: z.enum(['light', 'dark', 'system']).default('system'),

  // Agent 偏好
  defaultModel: z.string().default('claude-opus-4-6'),
  maxTokens: z.number().default(4096),
  maxTurns: z.number().default(20),

  // 工具偏好
  allowedTools: z.array(z.string()).default(['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']),
  permissionMode: z.enum(['default', 'plan', 'acceptEdits', 'bypassPermissions']).default('default'),

  // 工作目录
  workingDirectory: z.string().optional(),

  // 自定义偏好（扩展用）
  custom: z.record(z.string(), z.unknown()).default({}),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

// 默认偏好
const DEFAULT_PREFERENCES: Preferences = {
  language: 'zh-CN',
  theme: 'system',
  defaultModel: 'claude-opus-4-6',
  maxTokens: 4096,
  maxTurns: 20,
  allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  permissionMode: 'default',
  workingDirectory: undefined,
  custom: {},
};

class PreferencesService {
  private store: Conf<Preferences>;

  constructor() {
    this.store = new Conf<Preferences>({
      projectName: 'claude-agent-demo',
      defaults: DEFAULT_PREFERENCES,
    });
  }

  /**
   * 获取所有偏好
   */
  getAll(): Preferences {
    return PreferencesSchema.parse(this.store.store);
  }

  /**
   * 获取单个偏好
   */
  get<K extends keyof Preferences>(key: K): Preferences[K] {
    return this.store.get(key);
  }

  /**
   * 设置单个偏好
   */
  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    this.store.set(key, value);
  }

  /**
   * 批量设置偏好
   */
  setMany(prefs: Partial<Preferences>): void {
    for (const [key, value] of Object.entries(prefs)) {
      this.store.set(key as keyof Preferences, value);
    }
  }

  /**
   * 重置为默认值
   */
  reset(): void {
    this.store.clear();
  }

  /**
   * 获取存储路径
   */
  getPath(): string {
    return this.store.path;
  }
}

// 单例导出
export const preferences = new PreferencesService();
