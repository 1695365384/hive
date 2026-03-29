/**
 * ContextCompactor 单元测试
 *
 * 测试压缩逻辑、fallback 路径、文件路径提取等
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextCompactor } from '../../src/agents/pipeline/ContextCompactor.js';
import type { AgentResult } from '../../src/agents/types/core.js';

// Mock ai module at top level for the invalid JSON test
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: 'This is not JSON at all',
  }),
}));

// Mock ProviderManager
const createMockProviderManager = (modelAvailable = true) => ({
  getModel: vi.fn().mockReturnValue(modelAvailable ? { modelId: 'mock-model' } : null),
  getModelForProvider: vi.fn().mockReturnValue(modelAvailable ? { modelId: 'mock-model' } : null),
});

describe('ContextCompactor', () => {
  let compactor: ContextCompactor;
  let mockProviderManager: ReturnType<typeof createMockProviderManager>;

  beforeEach(() => {
    mockProviderManager = createMockProviderManager();
    compactor = new ContextCompactor(mockProviderManager as any);
  });

  describe('compressPhase', () => {
    it('should skip compression for short text (< 500 chars)', async () => {
      const result: AgentResult = {
        text: 'This is a short result',
        tools: [],
        success: true,
      };

      const compressed = await compactor.compressPhase(result, 'explore');

      expect(compressed.summary).toBe('This is a short result');
      expect(compressed.phase).toBe('explore');
      expect(compressed.originalLength).toBe(22);
      expect(compressed.compressedLength).toBe(22);
      expect(compressed.findings).toEqual([]);
      expect(compressed.suggestions).toEqual([]);
    });

    it('should use fallback when no model is available', async () => {
      const compactorNoModel = new ContextCompactor(
        createMockProviderManager(false) as any,
      );

      const longText = 'A'.repeat(600);
      const result: AgentResult = {
        text: longText,
        tools: ['Glob', 'Grep'],
        success: true,
      };

      const compressed = await compactorNoModel.compressPhase(result, 'explore');

      expect(compressed.summary.length).toBeLessThanOrEqual(2002); // 2000 + '...'
      expect(compressed.phase).toBe('explore');
      expect(compressed.originalLength).toBe(600);
    });

    it('should handle LLM returning invalid JSON gracefully', async () => {
      const longText = 'B'.repeat(600);
      const result: AgentResult = {
        text: longText,
        tools: [],
        success: true,
      };

      // Should fall back to truncation without throwing
      const compressed = await compactor.compressPhase(result, 'plan');

      expect(compressed.summary).toBeDefined();
      expect(compressed.phase).toBe('plan');
      expect(compressed.originalLength).toBe(600);
    });
  });

  describe('extractFilePaths (via fallback)', () => {
    it('should extract file paths from text in fallback mode', async () => {
      const compactorNoModel = new ContextCompactor(
        createMockProviderManager(false) as any,
      );

      const text = `
        I found several important files:
        - src/agents/core/Agent.ts contains the main agent logic
        - src/providers/ProviderManager.ts manages providers
        - packages/core/src/tools/built-in/bash-tool.ts has bash tool
        The file src/index.ts is the entry point.
      `;

      const result: AgentResult = {
        text: text.repeat(10), // Make it long enough for compression
        tools: [],
        success: true,
      };

      const compressed = await compactorNoModel.compressPhase(result, 'explore');

      expect(compressed.keyFiles.length).toBeGreaterThan(0);
      // Should find at least some file paths
      const allPaths = compressed.keyFiles.join(' ');
      expect(allPaths).toContain('.ts');
    });
  });

  describe('truncate', () => {
    it('should not truncate text under limit', async () => {
      const compactorNoModel = new ContextCompactor(
        createMockProviderManager(false) as any,
      );

      const result: AgentResult = {
        text: 'Short text',
        tools: [],
        success: true,
      };

      const compressed = await compactorNoModel.compressPhase(result, 'explore');
      expect(compressed.summary).toBe('Short text');
    });

    it('should truncate long text to maxSummaryLength', async () => {
      const compactorNoModel = new ContextCompactor(
        createMockProviderManager(false) as any,
      );

      const longText = 'A'.repeat(5000);
      const result: AgentResult = {
        text: longText,
        tools: [],
        success: true,
      };

      const compressed = await compactorNoModel.compressPhase(result, 'explore');
      expect(compressed.summary.length).toBeLessThanOrEqual(2003); // 2000 + '...'
    });
  });

  describe('preserveRaw option', () => {
    it('should preserve raw text when preserveRaw is true', async () => {
      const compactorNoModel = new ContextCompactor(
        createMockProviderManager(false) as any,
      );

      const longText = 'A'.repeat(600);
      const result: AgentResult = {
        text: longText,
        tools: [],
        success: true,
      };

      const compressed = await compactorNoModel.compressPhase(result, 'explore', {
        preserveRaw: true,
      });

      expect(compressed.rawText).toBe(longText);
    });

    it('should not preserve raw text by default', async () => {
      const compactorNoModel = new ContextCompactor(
        createMockProviderManager(false) as any,
      );

      const longText = 'A'.repeat(600);
      const result: AgentResult = {
        text: longText,
        tools: [],
        success: true,
      };

      const compressed = await compactorNoModel.compressPhase(result, 'explore');

      expect(compressed.rawText).toBe('');
    });
  });
});
