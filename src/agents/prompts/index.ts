/**
 * Prompt 模块
 *
 * 统一导出 Prompt 模板和管理功能
 */

// 模板引擎
export {
  PromptTemplate,
  getPromptTemplate,
  createPromptTemplate,
} from './PromptTemplate.js';

// Prompt 常量和构建函数
export {
  // 常量
  THOROUGHNESS_PROMPTS,
  EXPLORE_AGENT_PROMPT,
  PLAN_AGENT_PROMPT,
  GENERAL_AGENT_PROMPT,

  // 构建函数
  buildExplorePrompt,
  buildPlanPrompt,
  buildIntelligentPrompt,

  // 模板渲染
  renderTemplate,
  loadTemplate,
} from './prompts.js';

// 类型
export type { TemplateVariables } from './PromptTemplate.js';
