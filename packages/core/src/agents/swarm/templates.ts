/**
 * 内置蜂群模板
 *
 * 每个模板族提供 simple / medium / complex 三种变体。
 * medium 为默认变体（不填 variant 时使用）。
 */

import type { SwarmTemplate } from './types.js';

// ============================================
// add-feature 模板族
// ============================================

/**
 * add-feature-simple: 快速添加小功能
 *
 * explore ──▶ implement
 */
const ADD_FEATURE_SIMPLE: SwarmTemplate = {
  name: 'add-feature',
  variant: 'simple',
  match: /添加|新增|增加|实现|implement|add\s+(?:a\s+)?feature|create.*feature/i,
  description: '快速添加小功能：探索 → 实现（2 节点）',
  nodes: {
    explore: {
      agent: 'explore',
      prompt: '搜索项目中与 {task} 相关的代码结构、路由、模型定义。找出所有相关的文件和目录。',
      depends: [],
    },
    implement: {
      agent: 'general',
      prompt: '根据以下探索结果实现 {task}\n\n## 探索发现\n{explore.result}',
      depends: ['explore'],
    },
  },
  aggregate: {
    primary: 'implement',
    mergeFormat: 'section',
  },
};

/**
 * add-feature-medium: 标准添加功能
 *
 * explore ──┐
 *          ├──▶ implement ──┬──▶ review
 * plan ────┘                └──▶ test
 */
const ADD_FEATURE_MEDIUM: SwarmTemplate = {
  name: 'add-feature',
  variant: 'medium',
  match: /添加|新增|增加|实现|implement|add\s+(?:a\s+)?feature|create.*feature/i,
  description: '添加新功能：探索代码结构 → 规划方案 → 实现 → 审查 + 测试',
  nodes: {
    explore: {
      agent: 'explore',
      prompt: '搜索项目中与 {task} 相关的代码结构、路由、模型定义。找出所有相关的文件和目录。',
      depends: [],
    },
    plan: {
      agent: 'plan',
      prompt: '分析 {task} 的实现方案。找出需要修改或新增的文件，列出实现步骤。',
      depends: [],
    },
    implement: {
      agent: 'general',
      prompt: '根据以下探索和规划结果实现 {task}\n\n## 探索发现\n{explore.result}\n\n## 规划方案\n{plan.result}',
      depends: ['explore', 'plan'],
    },
    review: {
      agent: 'general',
      prompt: '审查以下代码变更，检查代码质量、最佳实践和潜在问题:\n{implement.result}',
      depends: ['implement'],
    },
    test: {
      agent: 'general',
      prompt: '为 {task} 生成测试用例。基于以下实现:\n{implement.result}',
      depends: ['implement'],
    },
  },
  aggregate: {
    primary: 'implement',
    merge: ['review', 'test'],
    mergeFormat: 'section',
  },
};

/**
 * add-feature-complex: 大型功能实现（含安全审计）
 *
 * explore ──┐
 *          ├──▶ implement ──▶ security-audit ──┬──▶ review ──▶ test
 * plan ────┘                                   └──▶ (end)
 */
const ADD_FEATURE_COMPLEX: SwarmTemplate = {
  name: 'add-feature',
  variant: 'complex',
  match: /添加|新增|增加|实现|implement|add\s+(?:a\s+)?feature|create.*feature/i,
  description: '大型功能实现：探索 + 规划 → 实现 → 安全审计 → 审查 → 测试',
  nodes: {
    explore: {
      agent: 'explore',
      prompt: '深入搜索项目中与 {task} 相关的所有代码结构、路由、模型定义、配置文件、安全相关模块。找出所有相关的文件和目录，并评估影响范围。',
      depends: [],
    },
    plan: {
      agent: 'plan',
      prompt: '详细分析 {task} 的实现方案。包括：需要修改或新增的文件、数据模型变更、API 变更、向后兼容性考虑、实现步骤和风险评估。',
      depends: [],
    },
    implement: {
      agent: 'general',
      prompt: '根据以下探索和规划结果实现 {task}\n\n## 探索发现\n{explore.result}\n\n## 规划方案\n{plan.result}',
      depends: ['explore', 'plan'],
    },
    'security-audit': {
      agent: 'general',
      prompt: '安全审计以下实现，检查 OWASP Top 10 漏洞、输入验证、认证授权、数据泄露风险:\n{implement.result}',
      depends: ['implement'],
    },
    review: {
      agent: 'general',
      prompt: '审查以下代码变更，检查代码质量、架构设计、性能问题和最佳实践:\n{implement.result}\n\n## 安全审计结果\n{security-audit.result}',
      depends: ['security-audit'],
    },
    test: {
      agent: 'general',
      prompt: '为 {task} 生成全面的测试用例（单元测试 + 集成测试 + 边界条件）。基于以下实现:\n{implement.result}',
      depends: ['review'],
    },
  },
  aggregate: {
    primary: 'implement',
    merge: ['security-audit', 'review', 'test'],
    mergeFormat: 'section',
  },
};

// ============================================
// debug 模板族
// ============================================

/**
 * debug-simple: 快速修复小问题
 *
 * explore ──▶ fix
 */
const DEBUG_SIMPLE: SwarmTemplate = {
  name: 'debug',
  variant: 'simple',
  match: /bug|错误|报错|不工作|异常|修复|fix|debug|crash/i,
  description: '快速修复：定位 → 修复（2 节点）',
  nodes: {
    explore: {
      agent: 'explore',
      prompt: '定位与 {task} 相关的代码文件。找出可能出问题的函数、类和模块。',
      depends: [],
    },
    fix: {
      agent: 'general',
      prompt: '修复以下 bug:\n{task}\n\n## 相关代码\n{explore.result}',
      depends: ['explore'],
    },
  },
  aggregate: {
    primary: 'fix',
    mergeFormat: 'section',
  },
};

/**
 * debug-medium: 标准 debug 流程
 *
 * explore ──▶ analyze ──▶ fix ──▶ verify
 */
const DEBUG_MEDIUM: SwarmTemplate = {
  name: 'debug',
  variant: 'medium',
  match: /bug|错误|报错|不工作|异常|修复|fix|debug|crash/i,
  description: '修复 Bug：定位问题 → 分析原因 → 修复 → 验证',
  nodes: {
    explore: {
      agent: 'explore',
      prompt: '定位与 {task} 相关的代码文件。找出可能出问题的函数、类和模块。',
      depends: [],
    },
    analyze: {
      agent: 'plan',
      prompt: '分析以下代码中可能的 bug 原因:\n{explore.result}\n\n问题描述: {task}',
      depends: ['explore'],
    },
    fix: {
      agent: 'general',
      prompt: '修复以下 bug:\n{task}\n\n## 分析结果\n{analyze.result}',
      depends: ['analyze'],
    },
    verify: {
      agent: 'general',
      prompt: '验证以下修复是否正确:\n{fix.result}\n\n原始问题: {task}',
      depends: ['fix'],
    },
  },
  aggregate: {
    primary: 'fix',
    merge: ['verify'],
    mergeFormat: 'section',
  },
};

/**
 * debug-complex: 深度 debug（含规划）
 *
 * explore ──▶ analyze ──▶ plan ──▶ fix ──▶ verify
 */
const DEBUG_COMPLEX: SwarmTemplate = {
  name: 'debug',
  variant: 'complex',
  match: /bug|错误|报错|不工作|异常|修复|fix|debug|crash/i,
  description: '深度调试：定位 → 分析 → 规划修复方案 → 修复 → 验证',
  nodes: {
    explore: {
      agent: 'explore',
      prompt: '深入定位与 {task} 相关的所有代码文件。找出可能出问题的函数、类、模块和配置。分析调用链和数据流。',
      depends: [],
    },
    analyze: {
      agent: 'plan',
      prompt: '深入分析以下代码中可能的 bug 原因，考虑边界条件、并发问题、状态管理:\n{explore.result}\n\n问题描述: {task}',
      depends: ['explore'],
    },
    plan: {
      agent: 'plan',
      prompt: '基于以下分析结果，规划修复方案。考虑修复的影响范围、回归风险和替代方案:\n{analyze.result}',
      depends: ['analyze'],
    },
    fix: {
      agent: 'general',
      prompt: '按照修复方案修复 bug:\n{task}\n\n## 分析结果\n{analyze.result}\n\n## 修复方案\n{plan.result}',
      depends: ['plan'],
    },
    verify: {
      agent: 'general',
      prompt: '全面验证以下修复是否正确，包括正常场景和边界条件:\n{fix.result}\n\n原始问题: {task}',
      depends: ['fix'],
    },
  },
  aggregate: {
    primary: 'fix',
    merge: ['verify'],
    mergeFormat: 'section',
  },
};

// ============================================
// code-review 模板族
// ============================================

/**
 * code-review-simple: 快速代码审查
 *
 * explore ──▶ review
 */
const CODE_REVIEW_SIMPLE: SwarmTemplate = {
  name: 'code-review',
  variant: 'simple',
  match: /review|审查|检查代码|code\s*review|代码审查/i,
  description: '快速代码审查：探索 → 审查（2 节点）',
  nodes: {
    explore: {
      agent: 'explore',
      prompt: '探索 {task} 相关的代码文件和结构。',
      depends: [],
    },
    review: {
      agent: 'general',
      prompt: '审查以下代码，检查代码质量、潜在问题和最佳实践:\n{task}\n\n## 代码结构\n{explore.result}',
      depends: ['explore'],
    },
  },
  aggregate: {
    primary: 'review',
    mergeFormat: 'section',
  },
};

/**
 * code-review-medium: 标准代码审查（全并行）
 *
 * security  ──┐
 *            ├──▶ aggregate
 * quality   ──┤
 *            │
 * test      ──┘
 */
const CODE_REVIEW_MEDIUM: SwarmTemplate = {
  name: 'code-review',
  variant: 'medium',
  match: /review|审查|检查代码|code\s*review|代码审查/i,
  description: '代码审查：安全审查 + 质量审查 + 测试覆盖审查（全并行）',
  nodes: {
    security: {
      agent: 'general',
      prompt: '安全审查 {task}。检查 OWASP Top 10 漏洞、输入验证、认证授权问题。',
      depends: [],
    },
    quality: {
      agent: 'general',
      prompt: '代码质量审查 {task}。检查代码可读性、设计模式、性能问题、最佳实践。',
      depends: [],
    },
    test: {
      agent: 'general',
      prompt: '测试覆盖审查 {task}。评估现有测试覆盖率，建议补充测试用例。',
      depends: [],
    },
  },
  aggregate: {
    primary: 'quality',
    merge: ['security', 'test'],
    mergeFormat: 'section',
  },
};

// ============================================
// refactor 模板族
// ============================================

/**
 * refactor-medium: 标准重构
 *
 * explore ──▶ refactor ──▶ test
 */
const REFACTOR_MEDIUM: SwarmTemplate = {
  name: 'refactor',
  variant: 'medium',
  match: /重构|优化|整理|refactor|optimize|improve.*code|清理代码/i,
  description: '代码重构：探索现有代码 → 重构优化 → 生成测试',
  nodes: {
    explore: {
      agent: 'explore',
      prompt: '探索 {task} 相关的代码结构。找出需要重构的文件和模块。',
      depends: [],
    },
    refactor: {
      agent: 'general',
      prompt: '根据以下探索结果执行重构:\n{task}\n\n## 现有代码结构\n{explore.result}',
      depends: ['explore'],
    },
    test: {
      agent: 'general',
      prompt: '为以下重构生成测试用例:\n{refactor.result}\n\n原始任务: {task}',
      depends: ['refactor'],
    },
  },
  aggregate: {
    primary: 'refactor',
    merge: ['test'],
    mergeFormat: 'section',
  },
};

// ============================================
// 所有内置模板
// ============================================

/**
 * 所有内置蜂群模板（含变体）
 */
export const BUILTIN_TEMPLATES: SwarmTemplate[] = [
  // add-feature: simple / medium / complex
  ADD_FEATURE_SIMPLE,
  ADD_FEATURE_MEDIUM,
  ADD_FEATURE_COMPLEX,
  // debug: simple / medium / complex
  DEBUG_SIMPLE,
  DEBUG_MEDIUM,
  DEBUG_COMPLEX,
  // code-review: simple / medium
  CODE_REVIEW_SIMPLE,
  CODE_REVIEW_MEDIUM,
  // refactor: medium
  REFACTOR_MEDIUM,
];
