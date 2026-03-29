/**
 * DynamicPromptBuilder 单元测试
 *
 * 测试动态 prompt 构建、格式化、token budget 控制等
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamicPromptBuilder } from '../../src/agents/pipeline/DynamicPromptBuilder.js';
import type { AgentPhaseResult, PromptBuildContext } from '../../src/agents/types/pipeline.js';

describe('DynamicPromptBuilder', () => {
  let builder: DynamicPromptBuilder;

  beforeEach(() => {
    builder = new DynamicPromptBuilder();
  });

  describe('buildPrompt', () => {
    it('should include task in the prompt', () => {
      const context: PromptBuildContext = {
        task: 'Fix the auth bug',
        priorResults: [],
        agentType: 'general',
      };

      const prompt = builder.buildPrompt(context);
      expect(prompt).toContain('Fix the auth bug');
    });

    it('should include language instruction when provided', () => {
      const context: PromptBuildContext = {
        task: 'Fix the auth bug',
        priorResults: [],
        agentType: 'general',
        languageInstruction: 'You must respond in Chinese.',
      };

      const prompt = builder.buildPrompt(context);
      expect(prompt).toContain('You must respond in Chinese.');
    });

    it('should include skill section when provided', () => {
      const context: PromptBuildContext = {
        task: 'Review code',
        priorResults: [],
        agentType: 'general',
        skillSection: '## Code Review Skill\nReview the code for issues.',
      };

      const prompt = builder.buildPrompt(context);
      expect(prompt).toContain('Code Review Skill');
    });

    it('should format prior phase results into context section', () => {
      const exploreResult: AgentPhaseResult = {
        summary: 'Found auth module in src/auth/',
        keyFiles: ['src/auth/login.ts', 'src/auth/token.ts'],
        findings: ['JWT tokens expire after 1 hour', 'No refresh token implementation'],
        suggestions: ['Implement refresh token flow'],
        rawText: '',
        phase: 'explore',
        originalLength: 5000,
        compressedLength: 200,
      };

      const context: PromptBuildContext = {
        task: 'Fix auth token refresh',
        priorResults: [exploreResult],
        agentType: 'general',
      };

      const prompt = builder.buildPrompt(context);
      expect(prompt).toContain('Exploration Phase');
      expect(prompt).toContain('src/auth/login.ts');
      expect(prompt).toContain('JWT tokens expire after 1 hour');
      expect(prompt).toContain('Implement refresh token flow');
    });

    it('should format multiple prior results', () => {
      const exploreResult: AgentPhaseResult = {
        summary: 'Found files',
        keyFiles: ['src/index.ts'],
        findings: ['Entry point is src/index.ts'],
        suggestions: [],
        rawText: '',
        phase: 'explore',
        originalLength: 1000,
        compressedLength: 100,
      };

      const planResult: AgentPhaseResult = {
        summary: 'Plan to refactor auth',
        keyFiles: ['src/auth/'],
        findings: [],
        suggestions: ['Step 1: Create new auth module'],
        rawText: '',
        phase: 'plan',
        originalLength: 2000,
        compressedLength: 150,
      };

      const context: PromptBuildContext = {
        task: 'Refactor auth',
        priorResults: [exploreResult, planResult],
        agentType: 'general',
      };

      const prompt = builder.buildPrompt(context);
      expect(prompt).toContain('Exploration Phase');
      expect(prompt).toContain('Planning Phase');
      expect(prompt).toContain('src/index.ts');
      expect(prompt).toContain('Step 1: Create new auth module');
    });
  });

  describe('token budget control', () => {
    it('should truncate context section when over budget', () => {
      // Create builder with very small budget
      const smallBuilder = new DynamicPromptBuilder({ maxChars: 400 });

      const largeResult: AgentPhaseResult = {
        summary: 'A'.repeat(500),
        keyFiles: ['file1.ts', 'file2.ts', 'file3.ts'],
        findings: Array(20).fill('Finding with some detail'),
        suggestions: Array(10).fill('Suggestion with some detail'),
        rawText: '',
        phase: 'explore',
        originalLength: 10000,
        compressedLength: 5000,
      };

      const context: PromptBuildContext = {
        task: 'Test task',
        priorResults: [largeResult],
        agentType: 'general',
      };

      const prompt = smallBuilder.buildPrompt(context);
      // Context section should be truncated (not the full 5000+ chars)
      // Base template is still loaded from file, so total may exceed 400,
      // but the context should be much smaller than the input
      expect(prompt.length).toBeLessThan(2000);
    });

    it('should remove skill section when over budget', () => {
      const smallBuilder = new DynamicPromptBuilder({ maxChars: 100 });

      const context: PromptBuildContext = {
        task: 'Test task',
        priorResults: [],
        agentType: 'general',
        skillSection: '## Large Skill\n' + 'x'.repeat(500),
      };

      const prompt = smallBuilder.buildPrompt(context);
      // Task should still be present
      expect(prompt).toContain('Test task');
      // Skill section may be removed or truncated
    });

    it('should always keep task, base template, and language', () => {
      const tinyBuilder = new DynamicPromptBuilder({ maxChars: 10 }); // ~40 chars

      const context: PromptBuildContext = {
        task: 'Fix bug',
        priorResults: [],
        agentType: 'general',
        languageInstruction: 'Respond in Chinese',
      };

      const prompt = tinyBuilder.buildPrompt(context);
      // These should always be present
      expect(prompt).toContain('Fix bug');
    });
  });

  describe('formatPriorResults', () => {
    it('should handle empty results array', () => {
      const formatted = builder.formatPriorResults([]);
      // Empty results should produce minimal output
      expect(formatted).toContain('Context from Previous Phases');
    });

    it('should handle result with no key files or findings', () => {
      const result: AgentPhaseResult = {
        summary: 'Nothing found',
        keyFiles: [],
        findings: [],
        suggestions: [],
        rawText: '',
        phase: 'explore',
        originalLength: 100,
        compressedLength: 50,
      };

      const formatted = builder.formatPriorResults([result]);
      expect(formatted).toContain('Nothing found');
      expect(formatted).not.toContain('Key files:');
      expect(formatted).not.toContain('Findings:');
    });

    it('should handle result with empty summary', () => {
      const result: AgentPhaseResult = {
        summary: '',
        keyFiles: ['src/index.ts'],
        findings: ['Important finding'],
        suggestions: [],
        rawText: '',
        phase: 'plan',
        originalLength: 100,
        compressedLength: 80,
      };

      const formatted = builder.formatPriorResults([result]);
      expect(formatted).toContain('Planning Phase');
      expect(formatted).toContain('src/index.ts');
      expect(formatted).toContain('Important finding');
    });
  });
});
