/**
 * Prompt 模块
 *
 * 统一导出 Prompt 模板和管理功能。
 * 提示词内容统一在 templates/ 目录的 .md 文件中维护。
 */

// 模板引擎
export {
  PromptTemplate,
  getPromptTemplate,
  createPromptTemplate,
  TEMPLATES_DIR,
} from './PromptTemplate.js';

// Prompt 构建函数
export {
  THOROUGHNESS_PROMPTS,
  buildExplorePrompt,
} from './prompts.js';

// 模板索引和热重载
export {
  listTemplates,
  listTemplatesByCategory,
  reloadTemplates,
  reloadTemplate,
  validateTemplates,
  getTemplateInfo,
  hasTemplate,
} from './templates/index.js';

// 类型
export type { TemplateVariables } from './PromptTemplate.js';
