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

/** Default compression timeout (ms) */
const COMPRESSION_TIMEOUT_MS = 30_000;

/** Default compression config */
const DEFAULT_CONFIG = {
  preserveRaw: false,
  maxSummaryLength: 2000,
  maxFindings: 20,
  maxSuggestions: 10,
} satisfies Required<Omit<CompactorConfig, 'model'>>;

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

    const resolvedConfig = {
      preserveRaw: config?.preserveRaw ?? DEFAULT_CONFIG.preserveRaw,
      maxSummaryLength: config?.maxSummaryLength ?? DEFAULT_CONFIG.maxSummaryLength,
      maxFindings: config?.maxFindings ?? DEFAULT_CONFIG.maxFindings,
      maxSuggestions: config?.maxSuggestions ?? DEFAULT_CONFIG.maxSuggestions,
      model: config?.model,
    };

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
    } catch (error) {
      // Log compression failure for observability, then fallback to truncation
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[ContextCompactor] Compression failed for ${phase} phase, using fallback: ${errorMsg}`);
      return this.fallback(result.text, phase, originalLength, resolvedConfig);
    }
  }

  /**
   * Call LLM to compress text into structured output
   */
  private async callLLM(
    rawText: string,
    phase: AgentType,
    config: {
      preserveRaw: boolean;
      maxSummaryLength: number;
      maxFindings: number;
      maxSuggestions: number;
      model?: string;
    },
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

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), COMPRESSION_TIMEOUT_MS);

    try {
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        abortSignal: abortController.signal,
      });

      return this.parseCompressedOutput(result.text);
    } finally {
      clearTimeout(timeoutId);
    }
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
    config: {
      preserveRaw: boolean;
      maxSummaryLength: number;
      maxFindings: number;
      maxSuggestions: number;
      model?: string;
    },
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
    // Match file paths with at least one path separator and a file extension
    // Prefix is 1-4 chars (e.g., src, lib, pkg, app, test) followed by / or \
    const pathPattern = /(?:^|[\s"'`(\[/])([a-zA-Z0-9_./\-]{1,4}[/\\][\w./\\-]+\.\w{1,10})(?:[\s"'`)\]:;,])/gm;

    const paths = new Set<string>();
    const matches = text.matchAll(pathPattern);
    for (const match of matches) {
      const p = match[1]?.trim();
      if (p && p.length > 5 && p.length < 200 && !p.includes('http')) {
        paths.add(p);
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
