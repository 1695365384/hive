/**
 * Pipeline 模块导出
 *
 * 子 Agent 管道：动态 prompt 构建（LLM 压缩已移除，主路径走 pi session compaction）。
 */

export { DynamicPromptBuilder, createDynamicPromptBuilder } from './DynamicPromptBuilder.js';
