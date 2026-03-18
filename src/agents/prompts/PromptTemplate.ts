/**
 * Prompt 模板系统
 *
 * 支持从文件加载和变量替换的模板引擎
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 模板目录
const TEMPLATES_DIR = path.join(__dirname, 'templates');

/**
 * 模板变量类型
 */
export type TemplateVariables = Record<string, string | number | boolean>;

/**
 * Prompt 模板类
 */
export class PromptTemplate {
  private cache: Map<string, string> = new Map();

  /**
   * 加载模板文件
   *
   * @param name - 模板名称（不含扩展名）
   * @returns 模板内容
   */
  load(name: string): string {
    // 检查缓存
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    // 尝试从文件加载
    const filePath = path.join(TEMPLATES_DIR, `${name}.md`);

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.cache.set(name, content);
      return content;
    }

    // 如果文件不存在，返回内联模板
    const inlineTemplate = this.getInlineTemplate(name);
    if (inlineTemplate) {
      this.cache.set(name, inlineTemplate);
      return inlineTemplate;
    }

    throw new Error(`Prompt template not found: ${name}`);
  }

  /**
   * 渲染模板（替换变量）
   *
   * @param name - 模板名称
   * @param variables - 变量映射
   * @returns 渲染后的内容
   */
  render(name: string, variables: TemplateVariables = {}): string {
    let template = this.load(name);

    // 替换 {{variable}} 格式的变量
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      template = template.replace(regex, String(value));
    }

    return template;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 内联模板（作为文件不存在时的 fallback）
   */
  private getInlineTemplate(name: string): string | null {
    const templates: Record<string, string> = {
      'intelligent': this.getIntelligentTemplate(),
      'explore': this.getExploreTemplate(),
      'plan': this.getPlanTemplate(),
    };

    return templates[name] || null;
  }

  /**
   * 智能工作流模板
   */
  private getIntelligentTemplate(): string {
    return `{{languageInstruction}}{{skillSection}}

## Task
{{task}}

## Your Capabilities

You are an intelligent agent with these tools:
- **Explore**: Glob, Grep, Read - Use these to understand the codebase/environment
- **Modify**: Write, Edit - Use these to make changes
- **Execute**: Bash - Use this to run commands

## How to Work

**CRITICAL: You decide the approach based on the task.**

1. **New creation tasks** (e.g., "write a bubble sort", "create a script"):
   - Start working immediately, no need to explore
   - Write the code directly

2. **Analysis/exploration tasks** (e.g., "analyze this project", "explain how X works"):
   - First explore the codebase using Glob, Grep, Read
   - Then provide a comprehensive answer

3. **Modification tasks** (e.g., "fix bug in X", "add feature to Y"):
   - First explore to understand the existing code
   - Then make the necessary changes

4. **Simple questions**:
   - Answer directly if you know the answer
   - Explore only if you need more context

## Critical Rules

1. **Be autonomous** - Don't ask for permission, just do what's needed
2. **Be intelligent** - Choose the right approach for the task
3. **Be thorough** - Complete the task fully
4. **Use tools proactively** - You have Glob, Grep, Read available for exploration

Start working on the task NOW:`;
  }

  /**
   * 探索模板
   */
  private getExploreTemplate(): string {
    return `{{thoroughness}}

## Task
{{task}}

## CRITICAL Instructions

1. **Start IMMEDIATELY** - Do NOT ask for more information
2. **Use your tools** - You have Glob, Read, Grep, Bash available
3. **Be proactive** - Take initiative to explore and understand
4. **Match user's language** - Respond in the EXACT SAME LANGUAGE as the task

## Exploration Strategy

### Step 1: Understand the Environment
\`\`\`
# List directory contents
ls -la

# Find relevant files by extension
Glob: **/*.{ts,js,tsx,jsx,json,md,py,go,rs,java,yaml,yml}
\`\`\`

### Step 2: Read Key Files
- Configuration: package.json, tsconfig.json, pyproject.toml, Cargo.toml, go.mod
- Documentation: README*, docs/, *.md
- Entry points: index.*, main.*, app.*, server.*, src/, lib/

### Step 3: Analyze and Synthesize
Answer these questions:
- What is this project/directory about?
- What is the structure/architecture?
- What are the main components?
- What technologies are used?
- Any notable patterns or issues?

## Response Format
Provide a structured analysis (match user's language):
- **Overview**: What is this about?
- **Structure**: How is it organized?
- **Tech Stack**: What technologies are used?
- **Key Files**: What are the important files?
- **Findings**: What did you discover?
- **Recommendations**: Any suggestions?

Start exploring NOW!`;
  }

  /**
   * 计划模板
   */
  private getPlanTemplate(): string {
    return `Research the codebase for planning:

## Task
{{task}}

## Your Goal
Gather context about:
1. What files/components are relevant?
2. How is this currently implemented?
3. What are the dependencies?
4. What patterns are used?

CRITICAL: Respond in the EXACT SAME LANGUAGE as the task above.

Provide information for creating a plan.`;
  }
}

// 单例
let globalTemplate: PromptTemplate | null = null;

/**
 * 获取全局 Prompt 模板
 */
export function getPromptTemplate(): PromptTemplate {
  if (!globalTemplate) {
    globalTemplate = new PromptTemplate();
  }
  return globalTemplate;
}

/**
 * 创建新的 Prompt 模板
 */
export function createPromptTemplate(): PromptTemplate {
  return new PromptTemplate();
}
