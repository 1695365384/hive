/**
 * 工具模块 — barrel export
 *
 * 统一导出 ToolRegistry 和所有内置工具。
 */

export {
  ToolRegistry,
  createToolRegistry,
  type AgentType as ToolAgentType,
} from './tool-registry.js';

// 内置工具（factory + 默认实例）
export {
  createBashTool,
  bashTool,
  createFileTool,
  fileTool,
  fileToolReadOnly,
  createGlobTool,
  globTool,
  createGrepTool,
  grepTool,
  createWebSearchTool,
  webSearchTool,
  createWebFetchTool,
  webFetchTool,
  createAskUserTool,
  askUserTool,
  setAskUserCallback,
  createSendFileTool,
  sendFileTool,
  setSendFileCallback,
  type BashToolOptions,
  type FileToolOptions,
  type AskUserCallback,
  type SendFileCallback,
} from './built-in/index.js';

// 工具基础设施
export { truncateOutput } from './built-in/utils/output-safety.js';
export { isDangerousCommand, isSensitiveFile } from './built-in/utils/security.js';
