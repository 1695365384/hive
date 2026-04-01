/**
 * Pipeline 类型定义
 *
 * 子 Agent 管道（explore → plan → general）相关的类型。
 * 包括阶段结果、压缩配置、动态 prompt 构建上下文。
 */

import type { AgentType } from './core.js';
import type { EnvironmentContext } from '../../environment/types.js';

// ============================================
// 阶段结果
// ============================================

/**
 * 子 Agent 阶段的结构化结果
 *
 * 在阶段间传递，替代原始文本拼接。
 * 由 ContextCompactor 从 AgentResult 压缩生成。
 */
export interface AgentPhaseResult {
  /** 压缩后的摘要（< 2000 chars） */
  summary: string;
  /** 关键文件路径列表 */
  keyFiles: string[];
  /** 关键发现/结论 */
  findings: string[];
  /** 建议操作 */
  suggestions: string[];
  /** 原始完整输出（仅在 preserveRaw 时保留） */
  rawText: string;
  /** 执行成功的阶段 */
  phase: AgentType;
  /** 压缩前的原始字符数 */
  originalLength: number;
  /** 压缩后的字符数 */
  compressedLength: number;
}

// ============================================
// 压缩配置
// ============================================

/**
 * Context Compactor 配置
 */
export interface CompactorConfig {
  /** 用于压缩的模型 ID（不指定则使用 provider 最低成本模型） */
  model?: string;
  /** 是否保留原始文本（用于 debug，默认 false） */
  preserveRaw?: boolean;
  /** 摘要最大字符数（默认 2000） */
  maxSummaryLength?: number;
  /** 最大 findings 数量（默认 20） */
  maxFindings?: number;
  /** 最大 suggestions 数量（默认 10） */
  maxSuggestions?: number;
}

// ============================================
// 动态 Prompt 构建
// ============================================

/**
 * 动态 Prompt 构建上下文
 */
export interface PromptBuildContext {
  /** 当前任务描述 */
  task: string;
  /** 前置阶段的结构化结果 */
  priorResults: AgentPhaseResult[];
  /** 当前 Agent 类型 */
  agentType: AgentType;
  /** 技能 section（可选） */
  skillSection?: string;
  /** 语言指令（可选） */
  languageInstruction?: string;
  /** 会话历史（可选，用于保持 chat/workflow 上下文连续） */
  sessionHistory?: Array<{ role: string; content: string }>;
  /** 系统环境信息（可选，注入到 system prompt 中） */
  environmentContext?: EnvironmentContext;
}
