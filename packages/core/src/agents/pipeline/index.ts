/**
 * Pipeline 模块导出
 *
 * 子 Agent 管道相关：上下文压缩、动态 prompt 构建
 */

export { ContextCompactor, createContextCompactor } from './ContextCompactor.js';
export { DynamicPromptBuilder, createDynamicPromptBuilder } from './DynamicPromptBuilder.js';
