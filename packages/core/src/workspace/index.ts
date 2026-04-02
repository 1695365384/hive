/**
 * 工作空间模块
 *
 * 统一管理所有本地化数据
 */

// 类型
export type {
  WorkspaceMetadata,
  WorkspaceConfig,
  WorkspacePaths,
  WorkspaceInitConfig,
  SessionConfig,
  StorageConfig,
  Preferences,
} from './types.js';

// 常量
export {
  DEFAULT_WORKSPACE_DIR,
  DEFAULT_WORKSPACE_NAME,
  WORKSPACE_VERSION,
} from './types.js';

// 管理器
export {
  WorkspaceManager,
  initWorkspace,
  createWorkspaceManager,
} from './WorkspaceManager.js';
