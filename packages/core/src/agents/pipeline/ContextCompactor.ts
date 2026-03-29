/**
 * Context Compactor
 *
 * Uses LLM to compress sub-agent phase output into structured summaries.
 * Each phase result is compressed into an AgentPhaseResult with:
 * - summary (< 2000 chars)
 * - keyFiles (all mentioned file paths)
 * - findings (key discoveries)
 * - suggestions (recommended actions)
 *
 * Fallback: if LLM compression fails, returns a basic truncated result.
 */

import { generateText } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderManager } from '../../providers/ProviderManager.js';
import type { AgentResult } from '../types/core.js';
import type { AgentPhaseResult, CompactorConfig } from '../types/pipeline.js';
import type { AgentType } from '../types/capabilities.js';
import { PromptTemplate } from '../prompts/PromptTemplate.js';

/** Default compression config */
const DEFAULT_CONFIG: Required<CompactorConfig> = {
  model: undefined as unknown as string, // use provider default
  preserveRaw: false,
  maxSummaryLength: 2000,
  maxFindings: 20,
  maxSuggestions: 10,
};

/**
 * Context Compactor
 *
 * Compresses agent phase outputs into structured summaries
 * using a low-cost LLM call.
 */
export class ContextCompactor {
  private providerManager: ProviderManager;
  private promptTemplate: PromptTemplate;

  constructor(providerManager: ProviderManager) {
    this.providerManager = providerManager;
    this.promptTemplate = new PromptTemplate();
  }

  /**
   * Compress an agent phase result
   *
   * @param result - The raw agent result to compress
   * @param phase - Which phase this result came from
   * @param config - Compression configuration
   * @returns Structured phase result
   */
  async compressPhase(
    result: AgentResult,
    phase: AgentType,
    config?: CompactorConfig,
  ): Promise<AgentPhaseResult> {
    const originalLength = result.text.length;

    // Short output doesn't need compression
    if (originalLength < 500) {
      return this.createPhaseResult(result.text, [], [], [], phase, originalLength);
    }

    const resolvedConfig = { ...DEFAULT_CONFIG, ...config };

    try {
      const compressed = await this.callLLM(result.text, phase, resolvedConfig);
      return {
        summary: this.truncate(compressed.summary, resolvedConfig.maxSummaryLength),
        keyFiles: compressed.keyFiles.slice(0, 100),
        findings: compressed.findings.slice(0, resolvedConfig.maxFindings),
        suggestions: compressed.suggestions.slice(0, resolvedConfig.maxSuggestions),
        rawText: resolvedConfig.preserveRaw ? result.text : '',
        phase,
        originalLength,
        compressedLength: this.computeLength(compressed),
      };
    } catch {
      // Fallback: basic truncation
      return this.fallback(result.text, phase, originalLength, resolvedConfig);
    }
  }

  /**
   * Call LLM to compress text into structured output
   */
  private async callLLM(
    rawText: string,
    phase: AgentType,
    config: Required<CompactorConfig>,
  ): Promise<{ summary: string; keyFiles: string[]; findings: string[]; suggestions: string[] }> {
    // Truncate raw text to avoid exceeding model context
    const truncatedRaw = rawText.length > 30000 ? rawText.slice(0, 30000) + '\n...[truncated]' : rawText;

    const systemPrompt = 'You are a compression assistant. Your job is to extract structured information from raw text. Output ONLY valid JSON.';

    const userPrompt = this.promptTemplate.render('compact', {
      phase,
      rawText: truncatedRaw,
    });

    const model = this.resolveModel(config.model);
    if (!model) {
      throw new Error('No model available for compression');
    }

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      maxSteps: 1,
    });

    return this.parseCompressedOutput(result.text);
  }

  /**
   * Parse the LLM output into structured data
   */
  private parseCompressedOutput(
    text: string,
  ): { summary: string; keyFiles: string[]; findings: string[]; suggestions: string[] } {
    // Strip markdown code fences if present
    const cleaned = text
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    return {
      summary: String(parsed.summary || ''),
      keyFiles: Array.isArray(parsed.keyFiles) ? parsed.keyFiles.map(String) : [],
      findings: Array.isArray(parsed.findings) ? parsed.findings.map(String) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
    };
  }

  /**
   * Fallback when LLM compression fails
   */
  private fallback(
    text: string,
    phase: AgentType,
    originalLength: number,
    config: Required<CompactorConfig>,
  ): AgentPhaseResult {
    const summary = this.truncate(text, config.maxSummaryLength);
    return {
      summary,
      keyFiles: this.extractFilePaths(text),
      findings: [],
      suggestions: [],
      rawText: config.preserveRaw ? text : '',
      phase,
      originalLength,
      compressedLength: summary.length,
    };
  }

  /**
   * Extract file paths from text using regex
   */
  private extractFilePaths(text: string): string[] {
    // Match common file path patterns
    const pathPatterns = [
      /(?:^|[\s"'`(\[])([\w./\-]+\.\w{1,10})(?:[\s"'`)\]:;,])/gm,
      /(?:src|lib|pkg|app|packages)[/\\][\w./\\\-]+/g,
    ];

    const paths = new Set<string>();
    for (const pattern of pathPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const p = match[1] || match[0];
        // Filter out obvious non-paths
        if (p.length > 5 && p.length < 200 && !p.includes('http')) {
          paths.add(p.trim());
        }
      }
    }

    return Array.from(paths).slice(0, 50);
  }

  /**
   * Resolve model for compression
   */
  private resolveModel(modelId: string | undefined): LanguageModelV3 | null {
    if (modelId) {
      return this.providerManager.getModel(modelId);
    }
    return this.providerManager.getModel();
  }

  /**
   * Create a basic phase result (for short texts)
   */
  private createPhaseResult(
    text: string,
    keyFiles: string[],
    findings: string[],
    suggestions: string[],
    phase: AgentType,
    originalLength: number,
  ): AgentPhaseResult {
    return {
      summary: text,
      keyFiles,
      findings,
      suggestions,
      rawText: '',
      phase,
      originalLength,
      compressedLength: text.length,
    };
  }

  /**
   * Truncate text to max length at a word boundary
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    const truncated = text.slice(0, maxLength);
    // Try to cut at last space/newline within the limit
    const lastBreak = Math.max(truncated.lastIndexOf(' '), truncated.lastIndexOf('\n'));
    return lastBreak > maxLength * 0.7 ? truncated.slice(0, lastBreak) + '...' : truncated + '...';
  }

  /**
   * Compute total character length of compressed output
   */
  private computeLength(data: {
    summary: string;
    keyFiles: string[];
    findings: string[];
    suggestions: string[];
  }): number {
    return (
      data.summary.length +
      data.keyFiles.join(',').length +
      data.findings.join(',').length +
      data.suggestions.join(',').length
    );
  }
}

// ============================================
// Factory
// ============================================

/**
 * Create a ContextCompactor instance
 */
export function createContextCompactor(providerManager: ProviderManager): ContextCompactor {
  return new ContextCompactor(providerManager);
}
