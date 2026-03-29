/**
 * Dynamic Prompt Builder
 *
 * Dynamically constructs system prompts for sub-agents based on:
 * - Base role template (loaded from .md files)
 * - Current task description
 * - Prior phase results (structured summaries)
 * - Optional skill section and language instruction
 *
 * Implements token budget control: when total prompt exceeds budget,
 * lower-priority sections are truncated or removed.
 */

import type { AgentPhaseResult, PromptBuildContext } from '../types/pipeline.js';
import type { AgentType } from '../types/capabilities.js';
import { PromptTemplate } from '../prompts/PromptTemplate.js';

/** Default max characters for the full prompt (~4K tokens) */
const DEFAULT_MAX_CHARS = 16000;

/** Estimated chars per token for budget calculation */
const CHARS_PER_TOKEN = 4;

/**
 * Dynamic Prompt Builder
 *
 * Constructs system prompts dynamically from base templates
 * and prior phase results.
 */
export class DynamicPromptBuilder {
  private promptTemplate: PromptTemplate;
  private maxChars: number;

  /**
   * @param options.maxChars - Maximum characters for the full prompt (default: ~4K tokens)
   */
  constructor(options?: { maxChars?: number }) {
    this.promptTemplate = new PromptTemplate();
    this.maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  }

  /**
   * Build a system prompt for the given context
   *
   * @param context - Build context with task, prior results, agent type
   * @returns Complete system prompt string
   */
  buildPrompt(context: PromptBuildContext): string {
    const sections = this.buildSections(context);
    return this.applyBudget(sections);
  }

  /**
   * Build individual prompt sections
   */
  private buildSections(context: PromptBuildContext): Map<string, string> {
    const sections = new Map<string, string>();

    // 1. Base role template (highest priority)
    const baseTemplate = this.loadBaseTemplate(context.agentType);
    sections.set('base', baseTemplate);

    // 2. Language instruction
    if (context.languageInstruction) {
      sections.set('language', context.languageInstruction);
    }

    // 3. Task description
    sections.set('task', `## Task\n${context.task}`);

    // 4. Prior phase results (formatted from structured data)
    if (context.priorResults.length > 0) {
      sections.set('context', this.formatPriorResults(context.priorResults));
    }

    // 5. Skill section (lowest priority)
    if (context.skillSection) {
      sections.set('skill', context.skillSection);
    }

    return sections;
  }

  /**
   * Load the base template for an agent type
   */
  private loadBaseTemplate(agentType: AgentType): string {
    const templateMap: Partial<Record<AgentType, string>> = {
      explore: 'explore',
      plan: 'plan',
      general: 'intelligent',
    };

    const templateName = templateMap[agentType] ?? 'intelligent';
    try {
      return this.promptTemplate.load(templateName);
    } catch {
      return `You are a ${agentType} agent. Complete the task efficiently.`;
    }
  }

  /**
   * Format prior phase results into a markdown context section
   */
  formatPriorResults(results: AgentPhaseResult[]): string {
    const parts: string[] = [];

    for (const result of results) {
      const phaseLabel = this.getPhaseLabel(result.phase);
      parts.push(`### ${phaseLabel}`);

      if (result.summary) {
        parts.push(result.summary);
      }

      if (result.keyFiles.length > 0) {
        parts.push(`\n**Key files:**\n${result.keyFiles.map(f => `- \`${f}\``).join('\n')}`);
      }

      if (result.findings.length > 0) {
        parts.push(`\n**Findings:**\n${result.findings.map(f => `- ${f}`).join('\n')}`);
      }

      if (result.suggestions.length > 0) {
        parts.push(`\n**Suggestions:**\n${result.suggestions.map(s => `- ${s}`).join('\n')}`);
      }

      parts.push('');
    }

    return `## Context from Previous Phases\n\n${parts.join('\n')}`;
  }

  /**
   * Apply token budget — truncate or remove low-priority sections
   */
  private applyBudget(sections: Map<string, string>): string {
    const sectionPriority: Record<string, number> = {
      base: 0,       // Always keep
      language: 0,   // Always keep
      task: 0,       // Always keep
      context: 2,    // High priority but can be truncated
      skill: 4,      // Lower priority, can be removed
    };

    // Calculate total size
    let totalSize = 0;
    for (const content of sections.values()) {
      totalSize += content.length;
    }

    // If within budget, return as-is
    if (totalSize <= this.maxChars) {
      return this.joinSections(sections);
    }

    // Sort sections by priority (remove low priority first)
    const sortedSections = Array.from(sections.entries())
      .sort((a, b) => (sectionPriority[b[0]] ?? 5) - (sectionPriority[a[0]] ?? 5));

    const remaining = new Map(sections);
    let currentSize = totalSize;

    for (const [name, content] of sortedSections) {
      if (currentSize <= this.maxChars) break;

      // Never remove base, language, or task
      if (sectionPriority[name] === 0) continue;

      const available = this.maxChars - (currentSize - content.length);

      if (available < 200) {
        // Budget too tight, remove this section entirely
        remaining.delete(name);
        currentSize -= content.length;
      } else {
        // Truncate this section to fit
        const truncated = this.smartTruncate(content, available);
        remaining.set(name, truncated);
        currentSize = currentSize - content.length + truncated.length;
      }
    }

    return this.joinSections(remaining);
  }

  /**
   * Join sections into final prompt
   */
  private joinSections(sections: Map<string, string>): string {
    const order = ['base', 'language', 'task', 'context', 'skill'];
    const parts: string[] = [];

    for (const name of order) {
      const content = sections.get(name);
      if (content) {
        parts.push(content);
      }
    }

    // Add any sections not in the explicit order
    for (const [name, content] of sections) {
      if (!order.includes(name)) {
        parts.push(content);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Smart truncate — try to cut at section boundaries
   */
  private smartTruncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    const truncated = text.slice(0, maxLength);

    // Try to cut at the last complete section (### heading)
    const lastHeading = truncated.lastIndexOf('\n### ');
    if (lastHeading > maxLength * 0.5) {
      return truncated.slice(0, lastHeading) + '\n\n> [Context truncated due to token budget]';
    }

    // Try to cut at last list item
    const lastItem = Math.max(
      truncated.lastIndexOf('\n- '),
      truncated.lastIndexOf('\n* '),
    );
    if (lastItem > maxLength * 0.5) {
      return truncated.slice(0, lastItem) + '\n\n> [Context truncated due to token budget]';
    }

    // Fall back to word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.7) {
      return truncated.slice(0, lastSpace) + '... [truncated]';
    }

    return truncated + '...';
  }

  /**
   * Get human-readable label for a phase
   */
  private getPhaseLabel(phase: AgentType): string {
    const labels: Partial<Record<AgentType, string>> = {
      explore: 'Exploration Phase',
      plan: 'Planning Phase',
      general: 'Execution Phase',
    };
    return labels[phase] ?? phase;
  }
}

// ============================================
// Factory
// ============================================

/**
 * Create a DynamicPromptBuilder instance
 */
export function createDynamicPromptBuilder(options?: { maxChars?: number }): DynamicPromptBuilder {
  return new DynamicPromptBuilder(options);
}
