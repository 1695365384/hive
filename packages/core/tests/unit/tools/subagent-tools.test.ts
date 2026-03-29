/**
 * 子 Agent 工具单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockAgentContext } from '../../mocks/agent-context.mock.js';

// Mock ai module (to isolate unit under test)
const mockTool = vi.fn();
vi.mock('ai', () => ({
  tool: (config: any) => {
    mockTool(config);
    return {
      description: config.description,
      inputSchema: config.inputSchema,
      execute: config.execute,
    };
  },
  zodSchema: (schema: any) => schema,
}));

// Mock runner to avoid hitting real provider
vi.mock('../../../src/agents/runtime/LLMRuntime.js', () => ({
  LLMRuntime: class MockLLMRuntime {
    run = vi.fn().mockResolvedValue({ text: 'sub-agent result', tools: [], success: true, duration: 100 });
  },
}));

import { createSubagentTool, createAllSubagentTools } from '../../../src/tools/built-in/subagent-tools.js';

describe('Subagent Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSubagentTool()', () => {
    it('should create a valid AI SDK tool with correct description', () => {
      const context = createMockAgentContext();
      const tool = createSubagentTool({
        name: 'explore',
        description: 'Test explore tool',
        agentName: 'explore',
      }, context);

      expect(tool.description).toBe('Test explore tool');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should call runner.execute with correct agent name and prompt', async () => {
      const context = createMockAgentContext();
      const tool = createSubagentTool({
        name: 'explore',
        description: 'Test explore tool',
        agentName: 'explore',
      }, context);

      const result = await tool.execute!({ prompt: 'Find all API endpoints' }, {} as any);
      expect(result).toBe('Mock agent result');
      expect(context.runner.execute).toHaveBeenCalledWith('explore', 'Find all API endpoints');
    });

    it('should return error message when sub-agent fails', async () => {
      const context = createMockAgentContext();
      (context.runner.execute as any).mockResolvedValueOnce({
        text: '',
        tools: [],
        success: false,
        error: 'No available model',
      });

      const tool = createSubagentTool({
        name: 'explore',
        description: 'Test explore tool',
        agentName: 'explore',
      }, context);

      const result = await tool.execute!({ prompt: 'test' }, {} as any);
      expect(result).toContain('Sub-agent error');
    });

    it('should return fallback when sub-agent returns empty text', async () => {
      const context = createMockAgentContext();
      (context.runner.execute as any).mockResolvedValueOnce({
        text: '',
        tools: [],
        success: true,
      });

      const tool = createSubagentTool({
        name: 'explore',
        description: 'Test explore tool',
        agentName: 'explore',
      }, context);

      const result = await tool.execute!({ prompt: 'test' }, {} as any);
      expect(result).toBe('Sub-agent returned no output');
    });
  });

  describe('createAllSubagentTools()', () => {
    it('should create explore and plan tools', () => {
      const context = createMockAgentContext();
      const tools = createAllSubagentTools(context);

      expect(Object.keys(tools)).toEqual(['explore', 'plan']);
    });

    it('should not create general sub-agent tool', () => {
      const context = createMockAgentContext();
      const tools = createAllSubagentTools(context);

      expect(tools).not.toHaveProperty('general');
    });

    it('should create tools with meaningful descriptions mentioning tool access', () => {
      const context = createMockAgentContext();
      const tools = createAllSubagentTools(context);

      expect(tools.explore.description).toContain('read-only');
      expect(tools.explore.description).toContain('Glob');
      expect(tools.explore.description).toContain('Grep');
      expect(tools.explore.description).toContain('Read');

      expect(tools.plan.description).toContain('research');
      expect(tools.plan.description).toContain('analysis');
    });
  });
});
