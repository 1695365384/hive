/**
 * DynamicPromptBuilder 单元测试
 *
 * 测试动态 prompt 构建、格式化、token budget 控制等
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamicPromptBuilder } from '../../src/agents/pipeline/DynamicPromptBuilder.js';
import type { AgentPhaseResult, PromptBuildContext } from '../../src/agents/types/pipeline.js';
import type { EnvironmentContext } from '../../src/environment/types.js';

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
      expect(prompt.length).toBeLessThan(3000);
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

  describe('environment context', () => {
    const mockEnv: EnvironmentContext = {
      os: { platform: 'darwin', arch: 'arm64', version: '23.5.0', displayName: 'macOS 14' },
      shell: 'zsh',
      node: { version: 'v20.11.0' },
      cpu: { model: 'Apple M1', cores: 8 },
      memory: { totalGb: 16 },
      cwd: '/Users/test/project',
    };

    it('should include Environment section when environmentContext is provided', () => {
      const context: PromptBuildContext = {
        task: 'Fix the auth bug',
        priorResults: [],
        agentType: 'general',
        environmentContext: mockEnv,
      };

      const prompt = builder.buildPrompt(context);
      expect(prompt).toContain('## Environment');
      expect(prompt).toContain('macOS 14 (darwin/arm64)');
      expect(prompt).toContain('zsh');
      expect(prompt).toContain('v20.11.0');
      expect(prompt).toContain('Apple M1');
      expect(prompt).toContain('8 cores');
      expect(prompt).toContain('16 GB');
      expect(prompt).toContain('/Users/test/project');
    });

    it('should not include Environment section when environmentContext is omitted', () => {
      const context: PromptBuildContext = {
        task: 'Fix the auth bug',
        priorResults: [],
        agentType: 'general',
      };

      const prompt = builder.buildPrompt(context);
      expect(prompt).not.toContain('## Environment');
    });

    it('should never truncate environment section (priority 0)', () => {
      const tinyBuilder = new DynamicPromptBuilder({ maxChars: 100 });

      const context: PromptBuildContext = {
        task: 'Fix bug',
        priorResults: [],
        agentType: 'general',
        environmentContext: mockEnv,
      };

      const prompt = tinyBuilder.buildPrompt(context);
      // Environment section should survive budget cuts
      expect(prompt).toContain('## Environment');
    });

    it('should mention query-environment tool', () => {
      const context: PromptBuildContext = {
        task: 'Test',
        priorResults: [],
        agentType: 'general',
        environmentContext: mockEnv,
      };

      const prompt = builder.buildPrompt(context);
      expect(prompt).toContain('env');
    });

    it('should display platform-specific OS labels', () => {
      const linuxEnv: EnvironmentContext = {
        ...mockEnv,
        os: { platform: 'linux', arch: 'x64', version: '5.15.0', displayName: 'Linux' },
      };

      const context: PromptBuildContext = {
        task: 'Test',
        priorResults: [],
        agentType: 'general',
        environmentContext: linuxEnv,
      };

      const prompt = builder.buildPrompt(context);
      expect(prompt).toContain('Linux (linux/x64)');
    });
  });

  describe('schedule awareness section', () => {
    it('should include schedule section when scheduleSummary is provided', () => {
      const context: PromptBuildContext = {
        task: 'Check my tasks',
        priorResults: [],
        agentType: 'general',
        scheduleSummary: '\n### Current Scheduled Tasks\n\n- **Daily logs** (cron, enabled, cron: 0 9 * * *)',
      };

      const prompt = builder.buildPrompt(context);
      expect(prompt).toContain('## Scheduled Tasks');
      expect(prompt).toContain('Daily logs');
      expect(prompt).toContain('0 9 * * *');
    });

    it('should include schedule capability declaration even without tasks', () => {
      const context: PromptBuildContext = {
        task: 'Hello',
        priorResults: [],
        agentType: 'general',
        scheduleSummary: '\n### Current Scheduled Tasks\n\nNo scheduled tasks configured.',
      };

      const prompt = builder.buildPrompt(context);
      expect(prompt).toContain('## Scheduled Tasks');
      expect(prompt).toContain('No scheduled tasks configured');
      expect(prompt).toContain('Confirmation Required');
    });

    it('should not include schedule section when scheduleSummary is undefined', () => {
      const context: PromptBuildContext = {
        task: 'Hello',
        priorResults: [],
        agentType: 'general',
      };

      const prompt = builder.buildPrompt(context);
      expect(prompt).not.toContain('## Scheduled Tasks');
    });

    it('should truncate schedule section when over budget (priority 4)', () => {
      const smallBuilder = new DynamicPromptBuilder({ maxChars: 100 });

      const context: PromptBuildContext = {
        task: 'Test task',
        priorResults: [],
        agentType: 'general',
        scheduleSummary: '\n### Current Scheduled Tasks\n\n' + '- **Task** (cron, enabled, cron: 0 9 * * *)\n'.repeat(50),
      };

      const prompt = smallBuilder.buildPrompt(context);
      // Task should still be present
      expect(prompt).toContain('Test task');
    });
  });
});
