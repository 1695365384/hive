/**
 * 内置工具 — barrel export
 *
 * 所有内置工具统一从此模块导出。
 * 每个工具使用 factory 模式创建，支持参数化配置。
 */

// 工具工厂
export { createBashTool, createRawBashTool, bashTool } from './bash-tool.js';
export type { BashToolOptions } from './bash-tool.js';

export { createFileTool, createRawFileTool, fileTool, fileToolReadOnly } from './file-tool.js';
export type { FileToolOptions } from './file-tool.js';

export { createGlobTool, createRawGlobTool, globTool } from './glob-tool.js';
export { createGrepTool, createRawGrepTool, grepTool } from './grep-tool.js';
export { createWebSearchTool, createRawWebSearchTool, webSearchTool } from './web-search-tool.js';
export { createWebFetchTool, createRawWebFetchTool, webFetchTool } from './web-fetch-tool.js';
export { createAskUserTool, createRawAskUserTool, askUserTool, setAskUserCallback } from './ask-user-tool.js';
export type { AskUserCallback, AskUserToolInput } from './ask-user-tool.js';

export { createSendFileTool, createRawSendFileTool, sendFileTool, setSendFileCallback } from './send-file-tool.js';
export type { SendFileCallback, SendFileToolInput } from './send-file-tool.js';
export type { WebFetchToolInput } from './web-fetch-tool.js';
export type { WebSearchToolInput } from './web-search-tool.js';

// Coordinator 工具
export { createAgentTool } from './agent-tool.js';
export { createTaskStopTool } from './task-stop-tool.js';
export { createSendMessageTool } from './send-message-tool.js';

// 环境查询工具
export { createEnvTool, createRawEnvTool, envTool, setEnvDbProvider } from './env-tool.js';
export type { EnvToolInput } from './env-tool.js';

// 工具基础设施
export { truncateOutput } from './utils/output-safety.js';
export { isDangerousCommand, isSensitiveFile } from './utils/security.js';
