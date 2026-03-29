/**
 * 内置工具 — barrel export
 *
 * 所有内置工具统一从此模块导出。
 * 每个工具使用 factory 模式创建，支持参数化配置。
 */

// 工具工厂
export { createBashTool, bashTool } from './bash-tool.js';
export type { BashToolOptions } from './bash-tool.js';

export { createFileTool, fileTool, fileToolReadOnly } from './file-tool.js';
export type { FileToolOptions } from './file-tool.js';

export { createGlobTool, globTool } from './glob-tool.js';
export { createGrepTool, grepTool } from './grep-tool.js';
export { createWebSearchTool, webSearchTool } from './web-search-tool.js';
export { createWebFetchTool, webFetchTool } from './web-fetch-tool.js';
export { createAskUserTool, askUserTool, setAskUserCallback } from './ask-user-tool.js';
export type { AskUserCallback } from './ask-user-tool.js';

// 工具基础设施
export { truncateOutput } from './utils/output-safety.js';
export { isDangerousCommand, isSensitiveFile } from './utils/security.js';
