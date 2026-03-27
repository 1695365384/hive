/**
 * 技能系统类型定义
 *
 * 定义技能相关的所有类型接口
 */

/**
 * 技能元数据
 *
 * 从 SKILL.md 的 YAML frontmatter 解析
 */
export interface SkillMetadata {
  /** 技能名称 */
  name: string;
  /** 技能描述（包含触发短语） */
  description: string;
  /** 技能版本 */
  version: string;
  /** 可选：作者信息 */
  author?: string;
  /** 可选：标签 */
  tags?: string[];
}

/**
 * 技能定义
 *
 * 完整的技能对象，包含元数据和内容
 */
export interface Skill {
  /** 技能元数据 */
  metadata: SkillMetadata;
  /** SKILL.md 完整内容（不含 frontmatter） */
  body: string;
  /** 技能目录路径 */
  path: string;
  /** 参考文件路径列表 */
  references: string[];
  /** 脚本文件路径列表 */
  scripts: string[];
  /** 示例文件路径列表 */
  examples: string[];
  /** 资源文件路径列表 */
  assets: string[];
}

/**
 * 技能上下文
 *
 * 技能执行时的上下文信息
 */
export interface SkillContext {
  /** 当前技能 */
  skill: Skill;
  /** 已加载的参考文件内容 */
  loadedReferences: Map<string, string>;
  /** 变量映射 */
  variables: Record<string, unknown>;
}

/**
 * 技能加载选项
 */
export interface SkillLoaderOptions {
  /** 技能目录路径 */
  skillsDir: string;
  /** 是否递归扫描子目录 */
  recursive?: boolean;
  /** 文件编码 */
  encoding?: BufferEncoding;
  /** 日志器 */
  logger?: import('../plugins/types.js').ILogger;
}

/**
 * 技能匹配结果
 */
export interface SkillMatchResult {
  /** 匹配的技能 */
  skill: Skill;
  /** 匹配的触发短语 */
  matchedPhrase: string;
  /** 匹配位置 */
  matchIndex: number;
}

/**
 * 技能系统配置
 */
export interface SkillSystemConfig {
  /** 内置技能目录 */
  builtinSkillsDir?: string;
  /** 用户自定义技能目录 */
  userSkillsDir?: string;
  /** 是否启用技能自动匹配 */
  enableAutoMatch?: boolean;
  /** 是否在系统提示中显示技能列表 */
  showSkillsInPrompt?: boolean;
}
